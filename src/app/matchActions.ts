/** What a match screen can do, whichever hook (computer, one device, online) runs the match. */
export interface MatchActions {
  toggle: (position: number) => void;
  submit: () => void;
  nextRound: () => void;
  /** Sequential (one device): the player up next starts their turn. */
  beginTurn: () => void;
}
