Node-fs remote procedure calls

github: https://github.com/kruemelo/fs-rpc.git

npm: https://www.npmjs.com/package/fs-rpc


## Client

### load module

supports CommonJS/AMD

`var rpc = requirejs('fs-rpc').Client;`

browser:

```
<script src="fs-rpc.js">
<script>
  // DOM
  var rpc = window.FSRPC.Client;
  ..
</script>
```

### Methods

#### Client.stringify(fnName, args)
stringifies a node fs function call.

**fnName** required string

the function name to be called on remote

**args** optional array of arguments or single argument

the arguments to be applied to the function. Always omit callback function argument!

**returns** string rpc

#### Example

```
var FSRPC = requirejs('fs-rpc'),
  rpc = FSRPC.Client,
  rpcStr = rpc.stringify(
  // fs.rename(oldPath, newPath, callback)
  // https://nodejs.org/api/fs.html#fs_fs_renamesync_oldpath_newpath
  'rename',
  [
    "/a/b/x",
    "/a/b/c"
  ]
);
-> '{"fn":"rename","args":["/a/b/x","/a/b/c"]}'
```

**note:** all path-arguments must be relative to the path set to `mountPath` on server-side.

### Client.parse()

parse rpc results

```
FSRPC.Client.parse('{"data":[null,{"size":123}]}');
```


## Server

use with connect/express, CLI, ..

All fs-rpcs will be executed relative to a mount path `mountPath`, e.g., folder `/home/customer`.

### Methods

#### constructor (validatorConfig, parsedCallback)

Instantiates an RPC object.

```
var FSRPC = require('fs-rpc');
var validatorConfig = require('./validator-config.json');
var rpc = FSRPC.Server(validatorConfig, function () {
  ..
});
```

**validatorConfig** required object

the validator hash loaded from 'validator-config.json'

#### parse(rpcString)

Parses the rpc string into an object.

`var rpcObj = rpc.parse(rpcString);`

**rpcString** required string

the `string` generated by the `FSRPC.Client.stringify()` method

**returns** object rpcObj or null for invalid rpc


#### extendPaths(rpcObj, mountPath)

Extends path-args by the `mountPath` string.

`rpc.extendPaths(rpcObj, mountPath);`

**rpcObj** required object

the `object` parsed by `rpc.parse()`

**mountPath** required string

the mounting path `mountPath`.

**returns** undefined


#### validate(rpcObj)

Validates the rpcObj for supported function calls and argument data types.

If the function name `rpc.fn` is not defined in the validator config, an error will be returned.

**rpcObj** required object

**returns** `null` for valid rpc or `object` error for invalid rpc


#### execute(fs, rpcObj, cb)

Applies the rpcObj function to the file system and returns all results to the callback function.

**fs** required object

the node fs module to be used for executing function 

**rpcObj** required object

the rpc object parsed (and validated) from rpcString that should be applied

**cb** required function

a callback function that returns the executed function results. 


## validator config

Validator config file `validator-config.json` (commented):

```
{
  // function name
  "rename": [      
    // argument list  
    // first argument
    {
      // valid data types; use 'undefined' if for optional args
      dataTypes: ["string"],
      // check for valid path
      isPath: true
    },
    // second argument
    {
      dataTypes: ["string"],
      isPath: true
    }
  ],
  // fs.mkdir(path[, mode], callback)
  "mkdir": [
    {dataTypes: ["string"], isPath: true},
    {dataTypes: ["undefined", "number"]}
  ]
}
```

client:
* RPC = FSRPC.Client
* xhr.done: parsed = RPC.parse(result);
* result: [err, ..resultValues]

## Server: use as an express middleware

```
var express = require('express');
var router = express.Router();

var RPCFS = require('rpc-fs');
var FSRPC = require('fs-rpc');

var rpcServer = FSRPC.Server(

  require('./validator-config.json'),
  
  function (validationError, rpc, req, res, next) {
    if (validationError) {
      next(validationError);
      return;
    }

    rpcServer.execute(RPCFS, rpc, function (err, result) {
      res.end(rpcServer.stringify([err, result]));              
    });
  }
);


router.use(rpcServer);

```

## Install

    $ sudo npm install

## Test

    $ npm test


License
-------
[WTFPL](http://www.wtfpl.net/)
