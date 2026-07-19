import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from 'cloudflare:workers';
import {
  applyQualityQuestionBatch,
  completeQuestionTask,
  failQuestionTask,
  type GenerateQuestionTaskParams,
  generateQuestionsForTarget,
  insertGeneratedQuestionBatch,
  loadQualityQuestionBatch,
  markQuestionTaskRunning,
  prepareQualityQuestionIds,
  type QualityQuestionTaskParams,
  type QuestionTaskPayload,
  type QuestionTaskStats,
  requestQualityDecisions,
  selectGenerationTargets,
  updateQuestionTaskProgress,
} from './questionTasks';

const AI_STEP_CONFIG: WorkflowStepConfig = {
  retries: {
    limit: 3,
    delay: '5 seconds',
    backoff: 'exponential' as const,
  },
  timeout: '10 minutes',
};

function now(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class QuestionTaskWorkflow extends WorkflowEntrypoint<
  CloudflareBindings,
  QuestionTaskPayload
> {
  async run(event: WorkflowEvent<QuestionTaskPayload>, step: WorkflowStep) {
    const payload = event.payload;
    try {
      if (payload.type === 'generate') {
        return await this.runGeneration(
          payload.taskId,
          payload.params as GenerateQuestionTaskParams,
          step,
        );
      }
      return await this.runQuality(
        payload.taskId,
        payload.params as QualityQuestionTaskParams,
        step,
      );
    } catch (error) {
      const message = errorMessage(error);
      await step.do(
        'record task failure',
        { retries: { limit: 2, delay: '2 seconds', backoff: 'exponential' }, timeout: '1 minute' },
        async () => {
          await failQuestionTask(this.env.CONTENT_DB, payload.taskId, message, now());
        },
      );
      console.error({ event: 'question_task_failed', taskId: payload.taskId, error: message });
      throw error;
    }
  }

  private async runGeneration(
    taskId: string,
    params: GenerateQuestionTaskParams,
    step: WorkflowStep,
  ): Promise<QuestionTaskStats> {
    const targets = await step.do('prepare generation targets', async () =>
      selectGenerationTargets(params),
    );
    await step.do('start generation task', async () => {
      await markQuestionTaskRunning(
        this.env.CONTENT_DB,
        taskId,
        targets.length ? '准备调用 AI 生成题目' : '没有匹配的知识点',
        targets.length,
        now(),
      );
    });

    const stats: QuestionTaskStats = { knowledgePoints: 0, inserted: 0 };
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const generated = await step.do(`generate questions ${index + 1}`, AI_STEP_CONFIG, async () =>
        generateQuestionsForTarget(this.env, target, params),
      );
      const applied = await step.do(`write generated questions ${index + 1}`, async () =>
        insertGeneratedQuestionBatch(
          this.env.CONTENT_DB,
          taskId,
          `generate-${index + 1}`,
          generated,
          now(),
        ),
      );
      stats.knowledgePoints = index + 1;
      stats.inserted += applied.inserted;
      await step.do(`report generation progress ${index + 1}`, async () => {
        await updateQuestionTaskProgress(this.env.CONTENT_DB, {
          taskId,
          eventKey: `generation-progress-${index + 1}`,
          stage: `已完成 ${target.id} ${target.name}`,
          current: index + 1,
          total: targets.length,
          stats,
          level: 'success',
          message: `${target.id} ${target.name} 写入 ${applied.inserted} 道待质检题目`,
          now: now(),
        });
      });
      if (index < targets.length - 1) {
        await step.sleep(`pace generation ${index + 1}`, '1 second');
      }
    }

    const completedStage = targets.length
      ? `生成完成：新增 ${stats.inserted} 道待质检题目`
      : '没有匹配的知识点，未生成题目';
    await step.do('complete generation task', async () => {
      await completeQuestionTask(this.env.CONTENT_DB, taskId, completedStage, stats, now());
    });
    return stats;
  }

  private async runQuality(
    taskId: string,
    params: QualityQuestionTaskParams,
    step: WorkflowStep,
  ): Promise<QuestionTaskStats> {
    const questionIds = await step.do('prepare quality question ids', async () =>
      prepareQualityQuestionIds(this.env.CONTENT_DB, params),
    );
    await step.do('start quality task', async () => {
      await markQuestionTaskRunning(
        this.env.CONTENT_DB,
        taskId,
        questionIds.length ? '准备调用 AI 逐批质检' : '没有匹配的题目',
        questionIds.length,
        now(),
      );
    });

    const stats: QuestionTaskStats = { checked: 0, passed: 0, failed: 0 };
    const workflowBatchSize = 20;
    const aiBatchSize = 5;
    for (let offset = 0; offset < questionIds.length; offset += workflowBatchSize) {
      const batchIndex = Math.floor(offset / workflowBatchSize) + 1;
      const batchIds = questionIds.slice(offset, offset + workflowBatchSize);
      const batch = await step.do(`load quality batch ${batchIndex}`, async () =>
        loadQualityQuestionBatch(this.env.CONTENT_DB, batchIds),
      );
      const decisions = await step.do(`quality review ${batchIndex}`, AI_STEP_CONFIG, async () => {
        const reviewed = [];
        for (let aiOffset = 0; aiOffset < batch.length; aiOffset += aiBatchSize) {
          reviewed.push(
            ...(await requestQualityDecisions(
              this.env,
              batch.slice(aiOffset, aiOffset + aiBatchSize),
            )),
          );
        }
        return reviewed;
      });
      const applied = await step.do(`apply quality review ${batchIndex}`, async () =>
        applyQualityQuestionBatch(
          this.env.CONTENT_DB,
          taskId,
          `quality-${batchIndex}`,
          decisions,
          now(),
        ),
      );
      stats.checked += applied.checked;
      stats.passed += applied.passed;
      stats.failed += applied.failed;
      await step.do(`report quality progress ${batchIndex}`, async () => {
        await updateQuestionTaskProgress(this.env.CONTENT_DB, {
          taskId,
          eventKey: `quality-progress-${batchIndex}`,
          stage: `已质检 ${stats.checked} / ${questionIds.length} 道`,
          current: stats.checked,
          total: questionIds.length,
          stats,
          level: applied.failed ? 'warning' : 'success',
          message: `本批 ${applied.checked} 道：${applied.passed} 道合格，${applied.failed} 道停用`,
          now: now(),
        });
      });
      if (offset + workflowBatchSize < questionIds.length) {
        await step.sleep(`pace quality ${batchIndex}`, '1 second');
      }
    }

    const completedStage = questionIds.length
      ? `质检完成：${stats.passed} 道合格，${stats.failed} 道停用`
      : '没有匹配的题目，未执行质检';
    await step.do('complete quality task', async () => {
      await completeQuestionTask(this.env.CONTENT_DB, taskId, completedStage, stats, now());
    });
    return stats;
  }
}
