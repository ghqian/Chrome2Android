/*jshint esversion: 6 */
var devices = {};
var socketIds = {};
var ul = $('#deviceList');
var temp;
var tmpRes = '';
var tmpDevices = '';
var screenWidth = 371;
var screenHeight = 710;
var client = new Tcp();
var tips = "请先启动adb服务，再使用此应用:run '$adb start-server'";
throwTip(tips, 'info');

function throwTip(tips, type) {
    tips = tips || '无初始tips';
    type = type || 'danger';
    var tmpl = `<div class="row alert alert-` + type + ` alert-dismissible" role="alert">
      <div class="col-xs-2">
        <strong>tips!</strong>
      </div>
      <div class="col-xs-9">
        <span>` + tips + `</span>
      </div>
      <div class="col-xs-1">
        <button type="button" class="close" data-dismiss="alert"><span>&times;</span></button>
      </div>
    </div>`;
    $('.container').before(tmpl);
}

function closeSocket(screenSocketIds) {
    var callback = () => {
        if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
    };
    for (var id in screenSocketIds) {
        console.log('close socket:', screenSocketIds[id]);
        chrome.sockets.tcp.close(screenSocketIds[id], callback);
    }
}

function createDeviceLi(device, fragment) {
    var li = document.createElement('li');
    var liContnt = "<span class='col-xs-3 " + (device.productName ? "text-danger" : "") + "'>" + (device.productName || "无法获取") + '</span>' + "<span class='col-xs-5 " + (device.productName ? "text-danger" : "") + "'>" + (device.serialNumber || "无法获取") + '</span>';
    $(li).attr('id', device.device + device.serialNumber);
    $(li).addClass('row');
    var btn = document.createElement('button');
    btn.innerHTML = 'preparing';
    $(btn).addClass('btn btn-warning col-xs-2 col-xs-offset-1');
    $(btn).attr('disabled', 'disabled');
    li.innerHTML = liContnt;
    li.appendChild(btn);
    fragment.appendChild(li);
    setTimeout(function () {
        client.sendCommands('client', "shell:wm size", device.serialNumber, (socketId) => {
            socketIds[socketId] = device.device + device.serialNumber;
        });
    }, 2000);

    /*
     * 刚插入手机的时候还需要检测是否有文件，如果没有则安装
     * 安装前需要获取手机的框架，还有sdk版本，再然后推两个文件
     * */
    $(btn).click(function (e) {
        if (!device.SCsize) {
            device.SCsize = '1080x1920';
        }
        client.sendCommands('client', "shell:LD_LIBRARY_PATH=/data/local/tmp /data/local/tmp/minicap -P " + device.SCsize + "@360x768/0", device.serialNumber, (socketId) => {
            socketIds[socketId] = device.device + device.serialNumber;
        });

        setTimeout(function () {
            client.sendCommands('client', "shell:/data/local/tmp/minitouch", device.serialNumber, (socketId) => {
                socketIds[socketId] = device.device + device.serialNumber;
            });
        }, 800);

        setTimeout(function () {
            var obj = {
                device: device.device,
                serialNumber: device.serialNumber
            };
            chrome.app.window.create('screen.html', {
                id: JSON.stringify(obj),
                width: screenWidth,
                height: screenHeight,
                maxWidth: screenWidth,
                maxHeight: screenHeight,
                minWidth: screenWidth,
                minHeight: screenHeight,
            }, function (screenWin) {
                screenWin.onClosed.addListener(callback = function () {
                    closeSocket(screenWin.contentWindow.socketIds);
                    screenWin.contentWindow.socketIds = {};
                    screenWin.onClosed.removeListener(callback);
                });
            });
        }, 3000);

        $(e).parents('li').css('backgroundColor', '#ccc').siblings('li').css('backgroundColor', 'none');

    });
}

function appendLi(device) {
    var exist = device.device + device.serialNumber in devices;
    var fragment;

    devices[device.device + device.serialNumber] = device;
    devices[device.device + device.serialNumber].capPort = 3131 + device.device;
    devices[device.device + device.serialNumber].touchPort = 1111 + device.device;
    if (!exist) {
        fragment = document.createDocumentFragment();
        createDeviceLi(devices[device.device + device.serialNumber], fragment);
    }

    //检查ABI
    console.log('这次手机的serial:' + device.serialNumber);
    client.sendCommands('client', "shell:getprop ro.product.cpu.abi | tr -d '\r'", device.serialNumber, (socketId) => {
        console.log('ABI' + socketId);
        socketIds.searchId = socketId;
        socketIds[socketId] = device.device + device.serialNumber;
        var t1 = setTimeout(() => {
            if (tmpRes.startsWith('arm') || tmpRes.startsWith('x86')) {
                var regRN = /\r\n/g;
                tmpRes = tmpRes.replace(regRN, "");
                devices[device.device + device.serialNumber].ABI = tmpRes;
                client.sendCommands('client', "shell:getprop ro.build.version.sdk | tr -d '\r'", device.serialNumber, (socketId) => {
                    socketIds.searchId = socketId;
                    console.log('SDK' + socketId);
                    socketIds[socketId] = device.device + device.serialNumber;
                    var t2 = setTimeout(() => {
                        if (!isNaN(tmpRes)) {
                            var regRN = /\r\n/g;
                            tmpRes = tmpRes.replace(regRN, "");
                            devices[device.device + device.serialNumber].SDK = tmpRes;
                            var serial = device.serialNumber;
                            //开始推文件
                            var url3 = '/file/minitouch/' + devices[device.device + device.serialNumber].ABI + '/minitouch';
                            getData(url3, serial);
                            var url1 = '/file/prebuilt/' + devices[device.device + device.serialNumber].ABI + '/bin/minicap';
                            getData(url1, serial);
                            var url2 = '/file/prebuilt/' + devices[device.device + device.serialNumber].ABI + '/lib/android-' + devices[device.device + device.serialNumber].SDK + '/minicap.so';
                            getData(url2, serial);
                            var url4 = '/file/minirev/' + devices[device.device + device.serialNumber].ABI + '/minirev';
                            getData(url4, serial);
                        }
                        clearTimeout(t2);
                        tmpRes = '';
                    }, 2000);
                });
            }
            clearTimeout(t1);
            tmpRes = '';
        }, 3000);
    });
    if (exist) {
        $('#' + device.device + device.serialNumber).css('background-color', '#ccc');
    } else {
        ul.append(fragment);
    }
}

//发送 adb devices 查询设备状态是否可用
function adbDevice(device) {
    client.sendCommands('host', "host:devices", null, (socketId) => {
        //console.log('查询SDK')
        console.log('devices-l:' + socketId);
        socketIds.findDevice = socketId;
        socketIds[socketId] = socketId;
        var t3 = setTimeout(function () {
            console.log('tmpDevices:' + tmpDevices);
            var arr = tmpDevices.split('\n');
            console.log('开始查询状态');
            var callback = function () {
                //改变按钮
                $('#' + device.device + device.serialNumber).find('button').html('view').removeAttr('disabled').removeClass('btn-warning').addClass('btn-success');
            };
            var opt;
            for (var i = 0; i < arr.length; i++) {
                console.log('进入循环');
                if (arr[i].indexOf(device.serialNumber) != -1) {
                    if (arr[i].indexOf('device') != -1) {
                        console.log('状态可用');
                        //状态可用
                        //设置定时器 6s之后检查是否文件推送完成
                        appendLi(device);
                        setTimeout(callback, 6000);
                    } else if (arr[i].indexOf('unauthorized') != -1) {
                        console.log('没授权');
                        //设置定时器 6s之后检查是否文件推送完成
                        opt = {
                            type: "basic",
                            iconUrl: '/assets/ic_android_pressed.png',
                            title: '请允许手机调试',
                            message: "请点击允许USB调试,再尝试点击find devices...",
                        };
                        chrome.notifications.create(opt, () => {});

                    } else if (arr[i].indexOf('offline') != -1) {
                        console.log('状态离线');
                        //设置定时器 6s之后检查是否文件推送完成
                        opt = {
                            type: "basic",
                            iconUrl: '/assets/ic_android_pressed.png',
                            title: '手机状态不可用',
                            message: "adb检查手机状态为offline, 请检查是否已经允许USB调试或重启手机",
                        };
                        chrome.notifications.create(opt, () => {});
                    }
                    break;
                }
            }
            if (i == arr.length) {
                console.log('找不到手机');
                opt = {
                    type: "basic",
                    iconUrl: '/assets/ic_android_pressed.png',
                    title: '手机不可用',
                    message: "adb无法正常连接手机，请检查驱动是否安装成功",
                };
                chrome.notifications.create(opt, () => {});
            }
            tmpDevices = '';
            clearTimeout(t3);

        }, 1500);
    });
}
$('#mat_findDevice').click(() => {
    chrome.usb.getUserSelectedDevices({
        'multiple': false,
        filters: [{
            interfaceClass: 255,
            interfaceSubclass: 66,
            interfaceProtocol: 1
        }]
    }, function (devicesArr) {
        console.log(devicesArr);
        if (devicesArr.length > 0) {
            adbDevice(devicesArr[0]);
        }
    });
});

/*

chrome.usb.getDevices({}, (devicesArr)=> {
    if (chrome.runtime.lastError != undefined) {
        console.warn('chrome.usb.getDevices error: ' +
            chrome.runtime.lastError.message);
        return;
    }
    temp = devicesArr;
    if (devicesArr.length != 0) {
        appendLi(devicesArr)
    }
});

if (chrome.usb.onDeviceAdded) {
    chrome.usb.onDeviceAdded.addListener(function (device) {
        var arr = [];
        arr.push(device);
        appendLi(arr);
        devices[device.device + device.serialNumber] = device;
    });
}
*/
if (chrome.usb.onDeviceRemoved) {
    chrome.usb.onDeviceRemoved.addListener(function (device) {
        delete devices[device.device + device.serialNumber];
        var lis = ul.find('li');
        lis.remove('#' + device.device + device.serialNumber);
    });
}
chrome.sockets.tcp.onReceive.addListener(function (msg) {
    if (socketIds[msg.socketId]) {
        ab2str(msg.data, function (e) {
            if (socketIds.searchId && msg.socketId == socketIds.searchId) {
                e = e.trim();
                if (e != 'OKAY') {
                    tmpRes = tmpRes + e;
                }
            } else if (socketIds.findDevice && msg.socketId == socketIds.findDevice) {
                e = e.trim();
                console.log(msg.socketId + ':::::' + e);
                if (e != 'OKAY') {
                    tmpDevices = tmpDevices + e;
                }
            }
            console.log('每次的返回值:' + e);
            if (e.startsWith('OKAY')) {
                return null;
            } else if (e.indexOf('Physical size:') != -1) {
                var reg = /([0-9]+)x([0-9]+)/g;
                var tmp = reg.exec(e);
                devices[socketIds[msg.socketId]].SCsize = tmp[0];
            } else if (e.indexOf('Publishing virtual display') != -1) {
                client.sendCommands('host', "host-serial:" + devices[socketIds[msg.socketId]].serialNumber + ":forward:tcp:" + devices[socketIds[msg.socketId]].capPort + ";localabstract:minicap", devices[socketIds[msg.socketId]].serialNumber, (socketId) => {});
            } else if (e.indexOf('touch device') != -1) {
                client.sendCommands('host', "host-serial:" + devices[socketIds[msg.socketId]].serialNumber + ":forward:tcp:" + devices[socketIds[msg.socketId]].touchPort + ";localabstract:minitouch", devices[socketIds[msg.socketId]].serialNumber, (socketId) => {});
            }
        });
    }
});