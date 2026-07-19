import { useEffect, useState } from 'react';
import { getAuthConfig } from '../data/auth';

let availabilityPromise: Promise<boolean> | null = null;

function loadAvailability(): Promise<boolean> {
  availabilityPromise ??= getAuthConfig()
    .then(config => config.methods.phone || config.methods.wechat)
    .catch(() => false);
  return availabilityPromise;
}

export function useAuthAvailability(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    void loadAvailability().then(value => {
      if (active) setAvailable(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return available;
}
