// Message type constants shared between room.js (sender) and the client's
// switch(msg.type) dispatcher, so a typo in either place is a ReferenceError
// at require-time on the server side instead of a silent no-op.
const IN = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  BET: 'bet',
  CANCEL_BET: 'cancelBet',
  CASH_OUT: 'cashOut',
};

const OUT = {
  SNAPSHOT: 'snapshot',
  PHASE: 'phase',
  STATE: 'state',
  SYNC: 'sync',
  CASHOUT_RESULT: 'cashoutResult',
  LOSS_RESULT: 'lossResult',
  ROUND_END: 'roundEnd',
  BALANCE: 'balance',
  JACKPOT_WIN: 'jackpotWin',
  SUBSCRIBER_COUNT: 'subscriberCount',
  ERROR: 'error',
};

module.exports = { IN, OUT };
