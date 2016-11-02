'use strict';

var BEGIN = 'BEGIN';
var COMMIT = 'COMMIT';
var REVERT = 'REVERT';
// Array({transactionID: string or null, beforeState: {object}, action: {object}}
var INITIAL_OPTIMIST = [];

var ALLOWED_SELECTOR_KEYS = [
  'selectId',
  'selectType',
];

var defaultSelectAction = action => action.optimist;
var defaultSelectId = action => defaultSelectAction(action).id;
var defaultSelectType = action => defaultSelectAction(action).type;

module.exports = optimist;
module.exports.BEGIN = BEGIN;
module.exports.COMMIT = COMMIT;
module.exports.REVERT = REVERT;
function optimist(fn, selectors) {
  var selectId;
  var selectType;

  if (typeof selectors === 'object') {
    var selectorKeys = Object.keys(selectors);

    selectorKeys.forEach(key => {
      if (ALLOWED_SELECTOR_KEYS.indexOf(key) === -1) {
        throw new Error('[redux-optimist]: Unexpected key ' + key + ' in selector argument.');
      }
    });

    selectId = selectors.selectId || defaultSelectId;
    selectType = selectors.selectType || defaultSelectType;
  } else {
    selectId = defaultSelectId;
    selectType = defaultSelectType;
  }

  var isValidOptimistAction = action => selectId(action) && selectType(action);

  function beginReducer(state, action) {
    let {optimist, innerState} = separateState(state);
    optimist = optimist.concat([{beforeState: innerState, action}]);
    innerState = fn(innerState, action);
    validateState(innerState, action);
    return {optimist, ...innerState};
  }
  function commitReducer(state, action) {
    let {optimist, innerState} = separateState(state);
    var newOptimist = [], started = false, committed = false;
    optimist.forEach(function (entry) {
      if (started) {
        if (
          entry.beforeState &&
          matchesTransaction(entry.action, selectId(action))
        ) {
          committed = true;
          newOptimist.push({action: entry.action});
        } else {
          newOptimist.push(entry);
        }
      } else if (
        entry.beforeState &&
        !matchesTransaction(entry.action, selectId(action))
      ) {
        started = true;
        newOptimist.push(entry);
      } else if (
        entry.beforeState &&
        matchesTransaction(entry.action, selectId(action))
      ) {
        committed = true;
      }
    });
    if (!committed) {
      console.error('Cannot commit transaction with id "' + selectId(action) + '" because it does not exist');
    }
    optimist = newOptimist;
    return baseReducer(optimist, innerState, action);
  }
  function revertReducer(state, action) {
    let {optimist, innerState} = separateState(state);
    var newOptimist = [], started = false, gotInitialState = false, currentState = innerState;
    optimist.forEach(function (entry) {
      if (
        entry.beforeState &&
        matchesTransaction(entry.action, selectId(action))
      ) {
        currentState = entry.beforeState;
        gotInitialState = true;
      }
      if (!matchesTransaction(entry.action, selectId(action))) {
        if (
          entry.beforeState
        ) {
          started = true;
        }
        if (started) {
          if (gotInitialState && entry.beforeState) {
            newOptimist.push({
              beforeState: currentState,
              action: entry.action
            });
          } else {
            newOptimist.push(entry);
          }
        }
        if (gotInitialState) {
          currentState = fn(currentState, entry.action);
          validateState(innerState, action);
        }
      }
    });
    if (!gotInitialState) {
      console.error('Cannot revert transaction with id "' + selectId(action) + '" because it does not exist');
    }
    optimist = newOptimist;
    return baseReducer(optimist, currentState, action);
  }
  function baseReducer(optimist, innerState, action) {
    if (optimist.length) {
      optimist = optimist.concat([{action}]);
    }
    innerState = fn(innerState, action);
    validateState(innerState, action);
    return {optimist, ...innerState};
  }
  function matchesTransaction(action, id) {
    return (
      isValidOptimistAction(action) &&
      selectId(action) === id
    );
  }
  return function (state, action) {
    if (isValidOptimistAction(action)) {
      switch (selectType(action)) {
        case BEGIN:
          return beginReducer(state, action);
        case COMMIT:
          return commitReducer(state, action);
        case REVERT:
          return revertReducer(state, action);
      }
    }
    let separated = separateState(state);
    return baseReducer(separated.optimist, separated.innerState, action);
  };
}

function validateState(newState, action) {
  if (!newState || typeof newState !== 'object' || Array.isArray(newState)) {
    throw new TypeError(
      'Error while handling "' +
      action.type +
      '": Optimist requires that state is always a plain object.'
    );
  }
}

function separateState(state) {
  if (!state) {
    return {optimist: INITIAL_OPTIMIST, innerState: state};
  } else {
    let {optimist = INITIAL_OPTIMIST, ...innerState} = state;
    return {optimist, innerState};
  }
}
