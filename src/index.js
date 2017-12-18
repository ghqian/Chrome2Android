/*jshint esversion: 6 */
var devicePool = {};
var ul = $('#deviceList');
var screenWidth = 371;
var screenHeight = 710;
var client = new Tcp();

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
                adbDevice(usbArr[0]);
            }
        });
    });
    if (chrome.usb.onDeviceRemoved) {
        chrome.usb.onDeviceRemoved.addListener(function (device) {
            var deviceId = device.device + device.serialNumber;
            delete devicePool[deviceId];
            var lis = ul.find('li');
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

//发送 adb devices 查询设备状态是否可用
function adbDevice(usb) {
    execCommands('host', "host:devices", null, function (response) {
        var arr = response.split('\n');
        var opt;
        for (var i = 0; i < arr.length; i++) {
            console.log('进入循环');
            if (arr[i].indexOf(usb.serialNumber) != -1) {
                if (arr[i].indexOf('device') != -1) {
                    console.log('状态可用');
                    //状态可用
                    //设置定时器 6s之后检查是否文件推送完成
                    appendLi(usb);
                    // setTimeout(callback, 6000);
                } else if (arr[i].indexOf('unauthorized') != -1) {
                    console.log('没授权');
                    //设置定时器 6s之后检查是否文件推送完成
                    opt = {
                        type: "basic",
                        iconUrl: '/assets/ss_icon11.png',
                        title: '请允许手机调试',
                        message: "请点击允许USB调试,再尝试点击find devices...",
                    };
                    chrome.notifications.create(opt, () => {});

                } else if (arr[i].indexOf('offline') != -1) {
                    console.log('状态离线');
                    //设置定时器 6s之后检查是否文件推送完成
                    opt = {
                        type: "basic",
                        iconUrl: '/assets/ss_icon11.png',
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
                iconUrl: '/assets/ss_icon11.png',
                title: '手机不可用',
                message: "adb无法正常连接手机，请检查驱动是否安装成功",
            };
            chrome.notifications.create(opt, () => {});
        }
        return true;
    });
}

function appendLi(device) {
    var deviceId = device.device + device.serialNumber;
    var exist = deviceId in devicePool;
    var fragment;

    devicePool[deviceId] = device;
    devicePool[deviceId].capPort = 3131 + device.device;
    devicePool[deviceId].touchPort = 1111 + device.device;
    if (!exist) {
        fragment = document.createDocumentFragment();
        createDeviceLi(device, fragment);
    }
    findAbi(device);
    if (exist) {
        $('#' + deviceId).css('background-color', '#ccc');
    } else {
        ul.append(fragment);
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

    /*
     * 刚插入手机的时候还需要检测是否有文件，如果没有则安装
     * 安装前需要获取手机的框架，还有sdk版本，再然后推两个文件
     * */
    $(btn).click(function (e) {
        if (!device.SCsize) {
            device.SCsize = '1080x1920';
        }
        bridgeMinicap(device);
        $(e).parents('li').css('backgroundColor', '#ccc').siblings('li').css('backgroundColor', 'none');
    });
}

function bridgeMinicap(device) {
    var deviceId = device.device + device.serialNumber;
    execCommands('client', "shell:LD_LIBRARY_PATH=/data/local/tmp /data/local/tmp/minicap -P " + device.SCsize + "@360x768/0", device.serialNumber, function (response) {
        if (response.indexOf('Publishing virtual display') != -1) {
            client.sendCommands('host', "host-serial:" + devicePool[deviceId].serialNumber +
                ":forward:tcp:" + devicePool[deviceId].capPort +
                ";localabstract:minicap", devicePool[deviceId].serialNumber,
                (socketId) => {
                    bridgeMinitouch(device);
                });
            return true;
        }
        return false;
    });
}

function bridgeMinitouch(device) {
    var deviceId = device.device + device.serialNumber;
    execCommands('client', "shell:/data/local/tmp/minitouch", device.serialNumber, function (response) {
        if (response.indexOf('touch device') != -1) {
            client.sendCommands('host', "host-serial:" + devicePool[deviceId].serialNumber +
                ":forward:tcp:" + devicePool[deviceId].touchPort +
                ";localabstract:minitouch", devicePool[deviceId].serialNumber,
                (socketId) => {
                    showScreen(device);
                });
            return true;
        }
        return false;
    });
}

function showScreen(device) {
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
    });
}

function findAbi(device) {
    execCommands('client', "shell:getprop ro.product.cpu.abi | tr -d '\r'", device.serialNumber, function (response) {
        if (response.startsWith('arm') || response.startsWith('x86')) {
            var regRN = /\r\n/g;
            response = response.replace(regRN, "");
            console.log('ABI ' + response);
            devicePool[device.device + device.serialNumber].ABI = response;
            findSdkVer(device);
            return true;
        }
        return false;
    });
}

function findSdkVer(device) {
    var deviceId = device.device + device.serialNumber;
    execCommands('client', "shell:getprop ro.build.version.sdk | tr -d '\r'", device.serialNumber, function (response) {
        if (!isNaN(response) && response.length > 1) {
            var regRN = /\r\n/g;
            response = response.replace(regRN, "");
            console.log('SDK ' + response);
            devicePool[deviceId].SDK = response;
            //开始推文件
            var url3 = '/file/minitouch/' + devicePool[deviceId].ABI + '/bin/minitouch';
            getData(url3, device.serialNumber);
            var url1 = '/file/minicap/' + devicePool[deviceId].ABI + '/bin/minicap';
            getData(url1, device.serialNumber);
            var url2 = '/file/minicap/' + devicePool[deviceId].ABI + '/lib/android-' + devicePool[deviceId].SDK + '/minicap.so';
            getData(url2, device.serialNumber);
            var url4 = '/file/minirev/' + devicePool[deviceId].ABI + '/minirev';
            getData(url4, device.serialNumber);
            findSize(device);
            return true;
        }
        return false;
    });
}

function findSize(device) {
    execCommands('client', "shell:wm size", device.serialNumber, function (response) {
        if (response.indexOf('Physical size:') != -1) {
            var reg = /([0-9]+)x([0-9]+)/g;
            var tmp = reg.exec(response);
            console.log('SCsize ' + tmp[0]);
            devicePool[device.device + device.serialNumber].SCsize = tmp[0];
            enableViewButton(device);
            return true;
        }
        return false;
    });
}

function enableViewButton(device) {
    //改变按钮
    $('#' + device.device + device.serialNumber).find('button').html('view').removeAttr('disabled').removeClass('btn-warning').addClass('btn-success');
}

function execCommands(type, command, serial, callback) {
    var searchId;
    var result = '';
    var cb = function (msg) {
        if (searchId && msg.socketId == searchId) {
            ab2str(msg.data, function (e) {
                result += e.trim();
                if (result.startsWith('OKAY')) {
                    result = result.replace('OKAY', '');
                }
                console.log(type + " " + command + " " + searchId + " " + result);
                if (result == '') {
                    return;
                }
                if (callback(result)) {
                    chrome.sockets.tcp.onReceive.removeListener(cb);
                }
            });
        }
    };
    chrome.sockets.tcp.onReceive.addListener(cb);
    client.sendCommands(type, command, serial, (socketId) => {
        searchId = socketId;
    });
}