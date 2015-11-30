Node-fs remote procedure calls

github: https://github.com/kruemelo/fs-rpc.git

npm: https://www.npmjs.com/package/fs-rpc


## Client

### load module

supports CommonJS/AMD

`var rpc = requirejs('fs-rpc').Client();`

browser:

```
<script src="fs-rpc.js">
<script>
  // DOM
  var rpc = window.FSRPC.Client();
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
  rpc = FSRPC.Client(),
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

All fs-rpc will be executed relative to a mount path `mountPath`, e.g., folder `/home/customer`.

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

#### parse(rpcString, validatorConfig, mountPath)

Parses the rpc string into an object and extends path-args by the `mountPath` string.

`var rpcObj = fsRPC.parse(rpcString, validatorConfig, mountPath);`

**rpcString** required string

the `string` generated by the `fsRPC.stringify()` method

**mountPath** required string

the mounting path `mountPath`.

**returns** object rpcObj or null


#### validate(rpcObj, validatorConfig, mountPath)

Validates the rpcObj for supported function calls and argument data types.

If the function name `rpc.fn` is not defined in the validator config, an error will be returned.

**rpcObj** required object

**mountPath** required string

the mounting path `mountPath`.

All args with configured `true === isPath` will be checked: if the argument value starts with `mountPath`, the path check is OK.

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

## workflow

client:
  - RPC = FSRPC.Client
  - rpc = RPC.stringify(fn, args)
  - xhr.send(rpc) -> server

server:
  - express app: app = express();
  -- bodyParser = require('body-parser');
  -- app.use(bodyParser.json({limit: '6mb'}));
  -- app.use('/', router);
  - router: router = express.Router();
  -- FSRPC = require('fs-rpc');
  -- RPC = FSRPC.Server;
  -- router.post('/rpc', function (req, res, next)
  --- req.mountPath = req.app.fsMountPath;
  -- router.use(RPC(validatorConfig, fnRequesHandler));
  -- fnRequestHandler(validationError, rpc, req, res, next)
  --- RPC.execute(RPCFS, rpc, function (err, result) {
  ---- res.end(RPC.stringify([err, result])); -> client       

client:
  - RPC = FSRPC.Client
  - xhr.done: parsed = RPC.parse(result);
  - result: [err, ..resultValues]

## Server: use as an express middleware

```
var express = require('express');
var router = express.Router();

var RPCFS = require('rpc-fs');
var RPC = require('fs-rpc').Server;
var validatorConfig = require('./validator-config.json');

function parsedCallback (validationError, rpc, req, res, next) {
    if (validationError) {
      next(validationError);
      return;
    }

    RPC.execute(RPCFS, rpc, function (err, result) {
      res.end(RPC.stringify([err, result]));              
    });
}

router.use(RPC(
  validatorConfig, 
  parsedCallback
));

```

## Install

    $ sudo npm install

## Test

    $ npm test

or watch:

    $ ./node_modules/.bin/mocha -w


License
-------
[WTFPL](http://www.wtfpl.net/)
