/*jshint esversion: 6 */
var devicePool = {};

$(window).ready(function () {
    throwTip("请先启动adb服务，再使用此应用:run '$adb start-server'", 'info');
    $('#mat_findDevice').click(() => {
        chrome.usb.getUserSelectedDevices({
            'multiple': false,
            filters: [{
                interfaceClass: 255,
                interfaceSubclass: 66,
                interfaceProtocol: 1
            }]
        }, function (usbArr) {
            console.log(usbArr);
            if (usbArr.length > 0) {
                findDevice(usbArr[0]);
            }
        });
    });
    if (chrome.usb.onDeviceRemoved) {
        chrome.usb.onDeviceRemoved.addListener(function (device) {
            var deviceId = device.device + device.serialNumber;
            delete devicePool[deviceId];
            var lis = $('#deviceList').find('li');
            lis.remove('#' + deviceId);
        });
    }
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

});

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

function findDevice(usb) {
    execCommands('host', "host:devices", null, function (response) {
        var arr = response.split('\n');
        var opt;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].indexOf(usb.serialNumber) != -1) {
                if (arr[i].indexOf('device') != -1) {
                    console.log('serialNumber ' + usb.serialNumber);
                    appendLi(usb);
                } else if (arr[i].indexOf('unauthorized') != -1) {
                    console.log('没授权');
                    opt = {
                        type: "basic",
                        iconUrl: '/assets/ss_icon11.png',
                        title: '请允许手机调试',
                        message: "请点击允许USB调试,再尝试点击find devices...",
                    };
                    chrome.notifications.create(opt, () => {});
                } else if (arr[i].indexOf('offline') != -1) {
                    console.log('状态离线');
                    opt = {
                        type: "basic",
                        iconUrl: '/assets/ss_icon11.png',
                        title: '手机状态不可用',
                        message: "adb检查手机状态为offline, 请检查是否已经允许USB调试或重启手机",
                    };
                    chrome.notifications.create(opt, () => {});
                }
                return true;
            }
        }
        console.log('找不到手机');
        opt = {
            type: "basic",
            iconUrl: '/assets/ss_icon11.png',
            title: '手机不可用',
            message: "adb无法正常连接手机，请检查驱动是否安装成功",
        };
        chrome.notifications.create(opt, () => {});
        return false;
    });
}

function appendLi(usb) {
    var device = {
        device: usb.device,
        serialNumber: usb.serialNumber,
        productName: usb.productName
    };
    var deviceId = device.device + device.serialNumber;
    var exist = deviceId in devicePool;
    var fragment;

    device.capPort = 3131 + device.device;
    device.touchPort = 1111 + device.device;
    if (!exist) {
        fragment = document.createDocumentFragment();
        createDeviceLi(device, fragment);
    }
    findAbi(device, function (abi) {
        console.log('ABI ' + abi);
        findSdkVer(device, function (sdkVer) {
            console.log('SDK ' + sdkVer);
            getData('/file/minitouch/' + abi + '/bin/minitouch', device.serialNumber);
            getData('/file/minicap/' + abi + '/bin/minicap', device.serialNumber);
            getData('/file/minicap/' + abi + '/lib/android-' + sdkVer + '/minicap.so', device.serialNumber);
            getData('/file/minirev/' + abi + '/minirev', device.serialNumber);
            findSize(device, function (SCsize, w, h) {
                console.log('SCsize ' + SCsize);
                device.SCsize = SCsize;
                device.screenWidth = w;
                device.screenHeight = h;
                enableViewButton(device);
                devicePool[deviceId] = device;
            });
        });
    });
    if (exist) {
        $('#' + deviceId).css('background-color', '#ccc');
    } else {
        $('#deviceList').append(fragment);
    }
}

function createDeviceLi(device, fragment) {
    var li = document.createElement('li');
    var liContnt = "<span class='col-xs-3 " + (device.productName ? "text-danger" : "") + "'>" +
        (device.productName || "无法获取") + '</span>' +
        "<span class='col-xs-5 " + (device.productName ? "text-danger" : "") + "'>" +
        (device.serialNumber || "无法获取") + '</span>';
    $(li).attr('id', device.device + device.serialNumber);
    $(li).addClass('row');
    var btn = document.createElement('button');
    btn.innerHTML = 'preparing';
    $(btn).addClass('btn btn-warning col-xs-2 col-xs-offset-1');
    $(btn).attr('disabled', 'disabled');
    li.innerHTML = liContnt;
    li.appendChild(btn);
    fragment.appendChild(li);

    $(btn).click(function (e) {
        bridgeMinicap(device, function () {
            bridgeMinitouch(device, function (w, h) {
                console.log("tsWidth " + w + " tsHeight " + h);
                device.touchWidth = w;
                device.touchHeight = h;
                showScreen(device);
            });
        });
        $(e).parents('li').css('backgroundColor', '#ccc').siblings('li').css('backgroundColor', 'none');
    });
}

function bridgeMinicap(device, callback) {
    execCommands('client', "shell:LD_LIBRARY_PATH=/data/local/tmp /data/local/tmp/minicap -P " + device.SCsize + "@360x768/0", device.serialNumber, function (response) {
        if (response.indexOf('Publishing virtual displayINFO') != -1) {
            execCommands('host', "host-serial:" + device.serialNumber +
                ":forward:tcp:" + device.capPort +
                ";localabstract:minicap", device.serialNumber,
                (socketId) => {
                    return true;
                });
            callback();
            return true;
        }
        return false;
    });
}

function bridgeMinitouch(device, callback) {
    execCommands('client', "shell:/data/local/tmp/minitouch", device.serialNumber, function (response) {
        if (response.indexOf('Unable to start server on minitouch') != -1) {
            return true;
        }
        if (response.indexOf('binding socket') != -1) {
            return true;
        }
        if (response.indexOf('touch device') != -1) {
            var deviceId = device.device + device.serialNumber;
            // Type B touch device sec_touchscreen (4095x4095 with 10 contacts) detected on /dev/input/event0 (score 2109)
            var reg = /([0-9]+)x([0-9]+)/g;
            var tmp = reg.exec(response);
            execCommands('host', "host-serial:" + device.serialNumber +
                ":forward:tcp:" + device.touchPort +
                ";localabstract:minitouch", device.serialNumber,
                (socketId) => {
                    return true;
                });
            callback(tmp[1], tmp[2]);
            return true;
        }
        return false;
    });
}

function showScreen(device, socketId) {
    var screenWidth = 371;
    var screenHeight = 710;

    chrome.app.window.create('screen.html', {
        width: screenWidth,
        height: screenHeight,
        maxWidth: screenWidth,
        maxHeight: screenHeight,
        minWidth: screenWidth,
        minHeight: screenHeight,
    }, function (screenWin) {
        if (screenWin) {

            screenWin.contentWindow.device = device;
            screenWin.onClosed.addListener(callback = function () {
                var socketPool = screenWin.contentWindow.socketPool;
                var callback = () => {
                    if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
                };
                for (var id in socketPool) {
                    console.log('close socket:', socketPool[id]);
                    chrome.sockets.tcp.close(socketPool[id], callback);
                }
                screenWin.onClosed.removeListener(callback);
            });
        }
    });
}

function findAbi(device, callback) {
    execCommands('client', "shell:getprop ro.product.cpu.abi | tr -d '\r'", device.serialNumber, function (response) {
        if (response.startsWith('arm') || response.startsWith('x86')) {
            var regRN = /\r\n/g;
            var abi = response.replace(regRN, "");
            callback(abi);
            return true;
        }
        return false;
    });
}

function findSdkVer(device, callback) {
    execCommands('client', "shell:getprop ro.build.version.sdk | tr -d '\r'", device.serialNumber, function (response) {
        if (!isNaN(response) && response.length > 1) {
            var regRN = /\r\n/g;
            var sdkVer = response.replace(regRN, "");
            callback(sdkVer);
            return true;
        }
        return false;
    });
}

function findSize(device, callback) {
    execCommands('client', "shell:wm size", device.serialNumber, function (response) {
        if (response.indexOf('Physical size:') != -1) {
            var reg = /([0-9]+)x([0-9]+)/g;
            var tmp = reg.exec(response);
            if (tmp.length == 3) {
                callback(tmp[0], tmp[1], tmp[2]);
                return true;
            }
        }
        return false;
    });
}

function enableViewButton(device) {
    //改变按钮
    $('#' + device.device + device.serialNumber).find('button').html('view').removeAttr('disabled').removeClass('btn-warning').addClass('btn-success');
}