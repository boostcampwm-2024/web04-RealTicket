export interface PermissionResult {
  waitingStatus: boolean;
  enteringStatus: boolean;
  userOrder?: number;
}

export interface RePermissionResult {
  userOrder: number;
  totalWaiting: number;
  restMilisecond: number;
  enteringStatus: boolean;
}
