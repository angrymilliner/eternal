var net = require('net'),
    fs = require('fs'),
    path = require('path'),

    util = require('./util');


var messages = module.exports;


/*
* eternal will keep logs and a socket open in ~/.eternal/
* */
try {
    fs.mkdirSync(util.ETERNAL_DIR);
} catch (e) {
    if (e.code !== 'EEXIST') {
        console.error('Please make sure the $HOME environment variable is set to ' +
            'a directory, and that the current user has write access.');
        console.error(e);
    }
}

messages.SOCK_PATH = path.join(util.ETERNAL_DIR, 'sock');


/* wrapper that will cache socket streaming data */
function wrap_sock(socket, callback) {
    var message = '';

    socket.setEncoding('utf-8');
    socket.on('data', function(data) {
        message += data;
    });
    socket.on('end', function() {
        callback(message);
    });
}
messages.nowStamp = function() {
    return (new Date()).toISOString();
};

messages.createServer = function(message_handler) {

    try { // cleanup from a bad shutdown
        fs.unlinkSync(messages.SOCK_PATH)
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(e);
        }
    }

    var server = net.createServer({allowHalfOpen: true}, function(socket) {

        wrap_sock(socket, function(data) {
            var options = JSON.parse(data);

            if (options._VALUE && options._VALUE.debug) {
                console.log('DEBUG: message received:\n', options);
            }

            if (options._TYPE === 'ping') {
                socket.write('hello');
                return socket.end();
            }

            options.time = new Date();
            options.stime = options.time.toISOString();

            message_handler(socket, options);
        });
    });

    server.listen(messages.SOCK_PATH, function() {
        console.log('\n' + messages.nowStamp() + ': now is eternal');
    });

    return server;
};

messages.sendRequest = function(type, data, callback) {
    var client = net.createConnection({path: messages.SOCK_PATH}, function() {
        client.end(JSON.stringify({_TYPE: type, _VALUE: data}))
    });

    wrap_sock(client, function(data) {
        if (data) {
            try {
                data = JSON.parse(data);

                if (data._ERROR) {
                    return callback(data._ERROR);
                }
            } catch (e) {}
        }
        data = data || {};
        callback(undefined, data);
    });

    client.on('error', callback);
};

messages.sendJob = function(data, callback) {
    messages.sendRequest('job', data, callback);
};

// check if server is alive (for current user)
// usage:
// pingServer(function(err, success) {
messages.pingServer = function(callback) {
    messages.sendRequest('ping', undefined, function(err, data) {
        var success = (data === 'hello');

        if (err && err.code === 'ECONNREFUSED') {
            err = null;
        }
        callback(err, success)
    });
};