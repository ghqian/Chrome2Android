/*jshint esversion: 6 */
function sendCommands(type, cmd, serial, callback) {
    var address = '127.0.0.1';
    var port = 5037;
    var option = {
        persistent: false,
        bufferSize: 8192
    };
    chrome.sockets.tcp.create(option, function (socketInfo) {
        chrome.sockets.tcp.connect(socketInfo.socketId, address, port, function (e) {
            if (type == 'host') {
                chrome.sockets.tcp.send(socketInfo.socketId, str2ab(makeCommand(cmd)), function () {
                    callback(socketInfo.socketId);
                });
            } else if (type == 'client') {
                var conDevice = 'host:transport:' + serial;
                chrome.sockets.tcp.send(socketInfo.socketId, str2ab(makeCommand(conDevice)), function () {
                    chrome.sockets.tcp.send(socketInfo.socketId, str2ab(makeCommand(cmd)), function () {
                        console.log("cmd:" + type + " " + cmd + " " + socketInfo.socketId);
                        callback(socketInfo.socketId);
                    });
                });
            }
        });
    });
}

function execCommands(type, cmd, serial, callback) {
    var searchId;
    var result = '';
    var cb = function (msg) {
        if (searchId && msg.socketId == searchId) {
            ab2str(msg.data, function (e) {
                var tmp = e.trim();
                if (tmp == '') {
                    return;
                }
                result += tmp;
                if (result.startsWith('OKAY')) {
                    result = result.replace('OKAY', '');
                }
                if (result == '') {
                    return;
                }
                console.log("result:" + type + " " + cmd + " " + searchId + " " + result);
                if (callback(result, msg.socketId)) {
                    chrome.sockets.tcp.onReceive.removeListener(cb);
                }
            });
        }
    };
    chrome.sockets.tcp.onReceive.addListener(cb);
    sendCommands(type, cmd, serial, (socketId) => {
        searchId = socketId;
    });
}

function str2ab(oldStr, newAB, end) {
    //console.log(oldStr);
    oldStr = unescape(encodeURIComponent(oldStr));
    var o = oldStr.length;
    if (end) o++;
    if (!newAB) {
        newAB = new ArrayBuffer(o);
    }
    var i = new Uint8Array(newAB);
    if (end) i[oldStr.length] = 0;
    for (var r = 0,
        s = oldStr.length; r < s; r++) {
        i[r] = oldStr.charCodeAt(r);
    }
    return newAB;
}

function ab2str(buf, callback) {
    var b = new Blob([new Uint8Array(buf)]);
    var f = new FileReader();
    f.onload = function (e) {
        callback(e.target.result);
    };
    f.readAsText(b);
}

function makeCommand(cmd) {
    var hex = cmd.length.toString(16);
    while (hex.length < 4) {
        hex = "0" + hex;
    }
    cmd = hex + cmd;
    return cmd;
}