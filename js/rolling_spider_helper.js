var CCCD_UUID = '00002902-0000-1000-8000-00805f9b34fb';
var FA0B_UUID = '9a66fa0b-0800-9191-11e4-012d1540cb8e';
var FB0E_UUID = '9a66fb0e-0800-9191-11e4-012d1540cb8e';
var FB0F_UUID = '9a66fb0f-0800-9191-11e4-012d1540cb8e';

function ab2str(buf) {
  var result = '';
  var array = new Uint8Array(buf);
  for(var i = 0; i<array.length; i++){
    result += Number(array[i]) + ',';
  }
  return result;
}

function RollingSpiderHelper() {
  this._manager = navigator.mozBluetooth;
  this._stateManager = new StateManager(this).start();
  this.connected = false;
  this._characteristics = {};
  this._counter = 1;
}

RollingSpiderHelper.prototype = evt({

  connect: function (deviceNamePrefix) {
    var prefix = deviceNamePrefix || 'RS_';
    var that = this;
    if (this._stateManager.isAbleToConnect()) {
      this.fire('connecting');
      return new Promise(function(resolve, reject) {
        that.fire('scanning-start')
        that._startScan().then(function(handle) {
          that.fire('finding-device', {prefix: prefix});
          return that._findDevice(prefix);
        }).then(function(device) {
          that.fire('scanning-stop')
          that._stopScan();
          that.fire('gatt-connecting')
          return that._gatt.connect();
        }).then(function() {
          that.fire('discovering-services')
          return that._discoverServices();
        }).then(function() {
          that.fire('connected')
        }).catch(function(reason) {
          that.fire('connecting-failed', reason);
          reject(reason);
        });
      });
    } else {
      Promise.reject('in state ' + this._stateManager.state);
    }

  },

  _findDevice: function(deviceNamePrefix) {
    var that = this;
    // XXX: we should set timeout for rejection
    return new Promise(function(resolve, reject) {
      var onGattDeviceFount = function(evt) {
        // XXX: can we use evt.device.name.startWith ?
        if(evt.device.name.indexOf(deviceNamePrefix) === 0 && !that.connected) {
          that.connected = true;
          that._device = evt.device;
          that._gatt = that._device.gatt;
          resolve(evt.device);
        }
      };
      that._leScanHandle.addEventListener('devicefound', onGattDeviceFount);
    });
  },

  _startScan: function StartScan() {
    var that = this;
    if(!this._adapter){
      this._adapter = this._manager.defaultAdapter;
    }
    return this._adapter.startLeScan([]).then(function onResolve(handle) {
      that._leScanHandle = handle;
      return Promise.resolve(handle);
    }, function onReject(reason) {
      return Promise.reject(reason);
    });
  },

  _stopScan: function StopScan(){
    this._adapter.stopLeScan(this._leScanHandle).then(function onResolve() {
      this._leScanHandle = null;
      return Promise.resolve();
    }.bind(this), function onReject(reason) {
      return Promise.reject(reason);
    }.bind(this));
  },

  takeOff: function TakeOff(){
    var characteristic = this._characteristics[FA0B_UUID];

    // 4, (byte)mSettingsCounter, 2, 0, 1, 0
    var buffer = new ArrayBuffer(6);
    var array = new Uint8Array(buffer);
    array.set([4, this._counter++, 2, 0, 1, 0]);
    characteristic.writeValue(buffer).then(function onResolve(){
      console.log('takeoff success');
    }, function onReject(){
      console.log('takeoff failed');
    });
  },

  landing: function Landing(){
    var characteristic = this._characteristics[FA0B_UUID];

    // 4, (byte)mSettingsCounter, 2, 0, 3, 0
    var buffer = new ArrayBuffer(6);
    var array = new Uint8Array(buffer);
    array.set([4, this._counter++, 2, 0, 3, 0]);
    characteristic.writeValue(buffer).then(function onResolve(){
      console.log('landing success');
    }, function onReject(){
      console.log('landing failed');
    });
  },

  enableNotification: function EnableNotification(characteristic){
    var success = false;
    characteristic.startNotifications().then(function onResolve(){
      console.log('enableNotification for ' +
        characteristic.uuid + ' success');
    }, function onReject(reason){
      console.log('enableNotification for ' +
        characteristic.uuid + ' failed: ' + reason);
    });
    console.log(characteristic.descriptors);
    for (var i = 0; i < characteristic.descriptors.length; i++) {
      var descriptor = characteristic.descriptors[i];
      console.log('Descriptor CCCD uuid:' + descriptor.uuid);
      console.log('Descriptor CCCD value:' + descriptor.value);
      if (descriptor.uuid === CCCD_UUID) {
        console.log('CCCD found');
        var buffer = new ArrayBuffer(2);
        var array = new Uint8Array(buffer);
        array.set([0x01, 0x00]);
        descriptor.writeValue(buffer);
        success = true;
      }
    }
    return success;
  },

  onCharacteristicChanged: function OnCharacteristicChanged(evt) {
    var characteristic = evt.characteristic;
    var value = characteristic.value;
    console.log('The value of characteristic (uuid:' +
      characteristic.uuid + ') changed to ' + ab2str(value));

    switch(characteristic.uuid){
      case FB0E_UUID:
        var eventList = ['fsLanded', 'fsTakingOff', 'fsHovering',
          'fsUnknown', 'fsLanding', 'fsCutOff'];
        var array = new Uint8Array(value);
        this.fire(eventList[array[6]]);
        break;
      case FB0F_UUID:
        console.log('Battery: ' + ab2str(value));
        break;
    }
  },

  checkChar: function (){
    var charFB0E = this._characteristics[FB0E_UUID];
    var charFB0F = this._characteristics[FB0F_UUID];
    var charFA0B = this._characteristics[FA0B_UUID];

    return charFB0E && charFB0F && charFA0B;
  },

  _discoverServices: function DiscoverServices() {
    var that = this;
    return this._gatt.discoverServices().then(function onResolve(value) {
      this._gatt.oncharacteristicchanged =
        this.onCharacteristicChanged.bind(this);

      console.log('gatt client discoverServices:' +
        ' resolved with value: [' + value + ']');
      console.log('gatt client found ' + this._gatt.services.length +
        ' services in total');

      var services = this._gatt.services;
      for(var i = 0; i < services.length; i++) {
        var characteristics = services[i].characteristics;
        console.log('service[' + i + ']' + characteristics.length +
          'characteristics in total');
        for(var j = 0; j < characteristics.length; j++) {
          var characteristic = characteristics[j];
          var uuid = characteristic.uuid;
          this._characteristics[uuid] = characteristic;
          console.log(uuid);
        }
      }

      function retry() {
        console.log('discover services retry...');
        setTimeout(that._discoverServices(), 100);
      }

      return new Promise(function (resolve, reject){
        if(that.checkChar()){
          var notificationSuccess_FB0E = that.enableNotification(
            that._characteristics[FB0E_UUID]);
          var notificationSuccess_FB0F = that.enableNotification(
            that._characteristics[FB0F_UUID]);
          if(!notificationSuccess_FB0E || !notificationSuccess_FB0F){
            retry();
          } else {
            console.log('discover services success');
            resolve();
          }
        }else{
          retry();
        }
      });
    }.bind(this), function onReject(reason) {
      console.log('discoverServices reject: [' + reason + ']');
      return Promise.reject(reason);
    }.bind(this));
  }
});

