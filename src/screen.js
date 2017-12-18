/*jshint esversion: 6 */

var real = {
    width: 1080,
    height: 1920
};
var ratioWidth = 1;
var ratioHeight = 1;
var canvas = $('#mat_canvas');
var socketPool = {};
var client, currentDevice;

function ratio(real) {
    ratioWidth = real.width / canvas.width();
    ratioHeight = real.height / canvas.height();
}
ratio(real);

function mouseupListener(socketId) {
    var str = ['u\n', 'c\n'];
    for (var s in str) {
        var sTemp = str2ab(str[s], null, false);
        chrome.sockets.tcp.send(socketId, sTemp, function (n) {});
    }
    $('#mat_canvas').off('mousemove');
    $('#mat_canvas').off('mouseleave');
}

function mousedownListener(socketId) {
    if (event.button != 0) return;
    $('#mat_canvas').off('mousemove');
    $('#mat_canvas').off('mouseleave');
    var x = Math.ceil(event.offsetX * ratioWidth),
        y = Math.ceil(event.offsetY * ratioHeight);
    var str = ['d 0 ' + x + ' ' + y + ' 50\n',
        'c\n'
    ];
    for (var s in str) {
        var sTemp = str2ab(str[s], null, false);
        chrome.sockets.tcp.send(socketId, sTemp, function (n) {});
    }
    $('#mat_canvas').on('mousemove', mousemoveListener.bind(null, socketId));
    $('#mat_canvas').on('mouseleave', mouseupListener.bind(null, socketId));
}

function mousemoveListener(socketId) {
    var x = Math.ceil(event.offsetX * ratioWidth),
        y = Math.ceil(event.offsetY * ratioHeight);
    var str = ['m 0 ' + x + ' ' + y + ' 50\n',
        'c\n'
    ];
    for (var s in str) {
        var sTemp = str2ab(str[s], null, false);
        chrome.sockets.tcp.send(socketId, sTemp, function (n) {

        });
    }
}

$(window).ready(function () {
    chrome.app.window.current().onClosed.addListener(function () {
        var callback = () => {
            if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
        };
        for (var id in socketPool) {
            console.log('close socket:', socketPool[id]);
            chrome.sockets.tcp.close(socketPool[id], callback);
        }
        socketPool = {};
    });
    client = new Tcp();
    currentDevice = JSON.parse(chrome.app.window.current().id);
    var device = currentDevice.device;
    findMinicap(device);
    connectMinicap(device);
    connectMinitouch(device);
});

function findMinicap() {
    client.sendCommands('client', "shell:find /data/local/tmp/minicap", currentDevice.serialNumber, (socketId) => {
        console.log('findMinicap' + socketId);
        socketPool.findMinicap = socketId;
    });
    var callback = function (message) {
        if (message.socketId && message.socketId == socketPool.findMinicap) {
            ab2str(message.data, function (e) {
                console.log('返回值' + e);
                if (e.startsWith('OKAY')) {
                    chrome.sockets.tcp.onReceive.removeListener(callback);
                } else if (e.indexOf('No such file') != -1) {
                    //弹出提示信息
                    var opt = {
                        type: "basic",
                        iconUrl: '/assets/ss_icon11.png',
                        title: '设备异常',
                        message: "无法正常启动设备，请尝试重新连接设备或重新打开应用...",
                    };
                    chrome.notifications.create(opt, () => {});
                    //加哭脸
                    var div = document.createElement('div');
                    $(div).attr('id', 'mat_error');
                    $('body').append(div);
                }
            });
        }
    };
    chrome.sockets.tcp.onReceive.addListener(callback);
}

function connectMinitouch(device) {
    if (socketPool.minitouch)
        return;
    chrome.sockets.tcp.create(function (createInfo) {
        chrome.sockets.tcp.connect(createInfo.socketId, '127.0.0.1', 1111 + device, function () {
            socketPool.minitouch = createInfo.socketId;
            $('#mat_canvas').on('mousedown', mousedownListener.bind(null, createInfo.socketId));
            $('#mat_canvas').on('mouseup', mouseupListener.bind(null, createInfo.socketId));
        });
    });
    chrome.sockets.tcp.onReceive.addListener(function (message) {
        if (message.socketId && socketPool.minitouch && (socketPool.minitouch == message.socketId)) {
            //touchReceive(message.data);
        }
    });
}

function connectMinicap(device) {
    if (socketPool.minicap)
        return;
    chrome.sockets.tcp.create(function (createInfo) {
        chrome.sockets.tcp.connect(createInfo.socketId, "127.0.0.1", 3131 + device, function (result) {
            socketPool.minicap = createInfo.socketId;
        });
    });
    chrome.sockets.tcp.onReceive.addListener(function (message) {
        if (message.socketId && socketPool.minicap && (socketPool.minicap == message.socketId)) {
            tryRead(message); //minicap receive callback
        }
    });
}

/*
chrome.sockets.tcp.onReceive.addListener(function (message) {
    if (message.socketId) {
        if (socketIds.tcp5037 && message.socketId == socketIds.tcp5037) {
            ab2str(message.data, function (e) {
                if (!e.startsWith('OKAY')) {
                    socketReceive(e);
                }
            });
        }
    }
});

//未完成方法
function socketReceive(e) {
    console.log('receive:' + e);
    // 这里准备推送文件
    // if(e == 'arm64-v8a'){
    //   sendCommands("getprop ro.build.version.sdk | tr -d '\r'",'RO5PBM5LQWJZDQCM',(socketId)=>{})
    // } else if (!isNaN(e)){
    //   sendCommands('')
    // }
}
*/

var readBannerBytes = 0;
var bannerLength = 2;

var readFrameBytes = 0;
var frameBodyLength = 0;
var frameBody = new ArrayBuffer(0);
var banner = {
    version: 0,
    length: 0,
    pid: 0,
    realWidth: 0,
    realHeight: 0,
    virtualWidth: 0,
    virtualHeight: 0,
    orientation: 0,
    quirks: 0
};

function tryRead(message) {
    var chunk = new Uint8Array(message.data);
    //console.log('chunk.byteLength:',chunk.byteLength)
    for (var cursor = 0, len = chunk.byteLength; cursor < len;) {
        //console.log(readBannerBytes +'  '+ bannerLength);
        if (readBannerBytes < bannerLength) {
            //console.log(readBannerBytes);
            switch (readBannerBytes) {
                case 0:
                    // version
                    banner.version = chunk[cursor];
                    break;
                case 1:
                    // length
                    banner.length = bannerLength = chunk[cursor];
                    break;
                case 2:
                case 3:
                case 4:
                case 5:
                    // pid
                    banner.pid +=
                        (chunk[cursor] << ((readBannerBytes - 2) * 8)) >>> 0;
                    break;
                case 6:
                case 7:
                case 8:
                case 9:
                    // real width
                    banner.realWidth +=
                        (chunk[cursor] << ((readBannerBytes - 6) * 8)) >>> 0;
                    break;
                case 10:
                case 11:
                case 12:
                case 13:
                    // real height
                    banner.realHeight +=
                        (chunk[cursor] << ((readBannerBytes - 10) * 8)) >>> 0;
                    break;
                case 14:
                case 15:
                case 16:
                case 17:
                    // virtual width
                    banner.virtualWidth +=
                        (chunk[cursor] << ((readBannerBytes - 14) * 8)) >>> 0;
                    break;
                case 18:
                case 19:
                case 20:
                case 21:
                    // virtual height
                    banner.virtualHeight +=
                        (chunk[cursor] << ((readBannerBytes - 18) * 8)) >>> 0;
                    break;
                case 22:
                    // orientation
                    banner.orientation += chunk[cursor] * 90;
                    break;
                case 23:
                    // quirks
                    banner.quirks = chunk[cursor];
                    break;
            }
            cursor += 1;
            readBannerBytes += 1;
            //readBannerBytes == 1 ? console.log('read1:',banner) :'';
            //readBannerBytes == 2 ? console.log('read2:',banner) :'';

            if (readBannerBytes === bannerLength) {
                //console.log('banner', banner)
            }
        } else if (readFrameBytes < 4) { //0,1,2,3
            frameBodyLength += (chunk[cursor] << (readFrameBytes * 8)) >>> 0;
            cursor += 1; //4,5
            readFrameBytes += 1; //0,1,2,3
            //console.info('headerbyte%d(val=%d,cursor=%d)', readFrameBytes, frameBodyLength,cursor)
        } else {
            var abTemp, temp;
            if (len - cursor >= frameBodyLength) {
                // console.info('bodyfin(len=%d,cursor=%d)', frameBodyLength, cursor)

                abTemp = chunk.subarray(cursor, cursor + frameBodyLength);
                temp = new Uint8Array(abTemp.length + frameBody.byteLength);
                temp.set(new Uint8Array(frameBody));
                temp.set(abTemp, frameBody.byteLength);
                frameBody = temp.buffer;
                //console.log(frameBody.byteLength)
                DrawImage(frameBody);
                //console.log(frameBody.length)
                cursor += frameBodyLength;
                frameBodyLength = readFrameBytes = 0;
                frameBody = new ArrayBuffer(0);
            } else {
                //console.info('body(len=%d),cursor=%d', len - cursor,cursor)

                abTemp = chunk.subarray(cursor, len);
                temp = new Uint8Array(abTemp.length + frameBody.byteLength);
                temp.set(new Uint8Array(frameBody));
                temp.set(abTemp, frameBody.byteLength);
                frameBody = temp.buffer;

                frameBodyLength -= len - cursor;
                readFrameBytes += len - cursor;
                cursor = len;
            }
        }

        /*jshint browser:true*/
    }
}

function DrawImage(frameBody) {
    var BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    var canvas = document.getElementById('mat_canvas');
    var g = canvas.getContext('2d');
    var blob = new Blob([frameBody], {
        type: 'image/jpeg'
    });
    var URL = window.URL || window.webkitURL;
    var img = new Image();
    img.onload = function () {
        canvas.width = img.width;
        canvas.height = img.height;
        //ratio(real,img);
        g.drawImage(img, 0, 0);
        img.onload = null;
        img.src = BLANK_IMG;
        img = null;
        u = null;
        blob = null;
    };
    var u = URL.createObjectURL(blob);
    img.src = u;
}

/*buttons*/
//187多任务   3主页  4返回      26锁屏
document.getElementById('mat_back').addEventListener('click', function () {
    client.sendCommands('client', "shell:input keyevent 4", currentDevice.serialNumber, (socketId) => {});
});
document.getElementById('mat_home').addEventListener('click', function () {
    client.sendCommands('client', "shell:input keyevent 3", currentDevice.serialNumber, (socketId) => {});
});
document.getElementById('mat_tasks').addEventListener('click', function () {
    client.sendCommands('client', "shell:input keyevent 187", currentDevice.serialNumber, (socketId) => {});
});

/*监听拔调设备*/
if (chrome.usb.onDeviceRemoved) {
    chrome.usb.onDeviceRemoved.addListener(function (device) {
        if ((device.serialNumber + device.device) == (currentDevice.serialNumber + currentDevice.device)) {
            chrome.app.window.current().close();
        }
    });
}