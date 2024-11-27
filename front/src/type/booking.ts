export interface PermissionResult {
  waitingStatus: boolean;
  enteringStatus: boolean;
  userOrder?: number;
}

export interface RePermissionResult {
  headOrder: number;
  totalWaiting: number;
  throughputRate: number;
}
