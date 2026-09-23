export class AuthorityComponentPublisher {
  reset(): void;
  prepare(matchId: string, message: any): { message: Record<string, unknown>; commit(): void };
}
export class AuthorityComponentReceiver {
  constructor(matchId: string);
  receive(message: any): any;
}
