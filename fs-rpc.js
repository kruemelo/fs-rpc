(function(definition) {
    if (typeof module !== 'undefined') {
      module.exports = definition();
    }
    else if (typeof define === 'function' && typeof define.amd === 'object') {
      define(definition);
    }
    else if (typeof window === 'object') {
      window.FSRPC = definition;
    }
}(function () {

  'use strict';

  var FSRPC = function (validatorConfig) {
    this.validators = validatorConfig;
  };

  
  FSRPC.stringify = function (fnName, args) {
    var rpc = {
        fn: fnName,
        args: []
      };

    if (undefined !== args ) {
    
      if (!Array.isArray(args)) {
        args = [args];
      }

      if (args.length) {
        // add arguments
        args.forEach(function (arg, argIndex) {
          if (arg instanceof ArrayBuffer) {
            rpc.args.push(String.fromCharCode.apply(null, new Uint16Array(arg)));
            if (!rpc.buffers) {
              rpc.buffers = [];
            }
            rpc.buffers.push(argIndex);
          }
          else {
            rpc.args.push(arg);
          }
        });        
      }
    }

    return JSON.stringify(rpc);
  };

  
  FSRPC.prototype.parse = function (rpcStr, mountPath) {

    var rpc = JSON.parse(rpcStr),
      validator = this.validators[rpc.fn],
      path = require('path');

    if (!validator) {
      return null;
    }

    // extend paths with mount path
    validator.forEach(function (argValidator, argIndex) {
      if (argValidator.isPath && 'string' === typeof rpc.args[argIndex] ) {
        rpc.args[argIndex] = path.join(mountPath, rpc.args[argIndex]);
      }
    });

    // convert ArrayBuffers
    if (rpc.buffers) {
      rpc.buffers.forEach(function (abIndex) {
        var str = rpc.args[abIndex];    
        if ('string' === typeof str) {
          rpc.args[abIndex] = new Buffer(str, 'utf8');
        }
      }); 
    }

    return rpc;
  };


  FSRPC.prototype.validate = function (rpcObj, mountPath) {

    var fn = rpcObj.fn,
      args = rpcObj.args || [],
      validator = this.validators[fn],
      error = null,
      path = require('path');

    // validate for supported function name
    if (!validator) {
      return new Error('EINVALIDARGUMENT');
    }

    // validate arguments
    validator.some(function (argValidator, argIndex) {

      var arg = args[argIndex],
        required = -1 === argValidator.dataTypes.indexOf('undefined');

      // check if not required
      if (undefined === arg && required) {
        error = new Error('EMISSINGARGUMENT');
        // exit validator
        return true;
      }

      // check for valid data types
      if (-1 === argValidator.dataTypes.indexOf(typeof arg)) {
        error = new Error('EINVALIDARGTYPE');
        // exit validator
        return true;
      }

      // check for valid paths
      if (!argValidator.isPath) {
        return;
      }

      if (0 !== path.normalize(arg).indexOf(mountPath)) {
        error = new Error('EINVALIDPATH');
        // exit validator
        return true;        
      }

    });

    return error;
  };


  FSRPC.prototype.execute = function (fs, rpcObj, cb) {

    var fn = fs[rpcObj.fn],
      args = (rpcObj.args || []).concat(cb);

    if ('function' !== typeof fn) {
      cb(new Error('EINVALIDFUNCTION'));
      return this;
    } 

    fn.apply(null, args);

    return this;
  };

  return FSRPC;

}));
