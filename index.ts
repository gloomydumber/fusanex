import { createFusanex } from './adapter/in/createFusanex';
import type { FusanexConfig } from './adapter/in/createFusanex';

export default function fusanex(config?: FusanexConfig) {
  return createFusanex(config);
}

export { createFusanex };
export type { FusanexConfig };