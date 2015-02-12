var util = require('util');
var SerialPort = require('serialport').SerialPort;
var xbee_api = require('xbee-api');
var Client = require('node-rest-client').Client;

var C = xbee_api.constants;
var client = new Client();

// registering remote methods 
//client.registerMethod("postMethod", "http://192.168.7.2:3000/nodes", "POST");
//client.methods.postMethod(args, function(data,response){
//    // parsed response body as js object 
//    console.log(data);
//    // raw response 
//    console.log(response);
//});

var g_COORDINATOR_ADDR16_LSB = 0x00;
var g_COORDINATOR_ADDR16_MSB = 0x00;
var g_COORDINATOR_ENDPOINT = 0xE8;

var xbeeAPI = new xbee_api.XBeeAPI({
  api_mode: 1,
  raw_frames: false
});

var serialport = new SerialPort("/dev/ttyUSB0", {
  baudrate: 9600,
  parser: xbeeAPI.rawParser()
});

// Create a variable store the list of nodes at server
var nodes;

var API_GET_NODES = function (){
    client.get("http://127.0.0.1:3000/api/nodes", function(data,response) {
        // parsed response body as js object 
        nodes = JSON.parse(data)
        console.log(nodes)
        // raw response 
        console.log(response.statusCode);
    });
}


API_GET_NODES();

serialport.on("open", function() {
//  console.log("Serial port open... sending ATND");
    sendATCommand('CH');
});

var sendATCommand = function(cdStr) {
  var frame = {
    type: C.FRAME_TYPE.AT_COMMAND,
    command: cdStr,
    commandParameter: [],
  };

  serialport.write(xbeeAPI.buildFrame(frame), function(err, res) {
    if (err) 
      throw(err);
    else{
//      console.log("written bytes: "+util.inspect(res));
    }
  });
}

var sendAPI = function(frame){
  serialport.write(xbeeAPI.buildFrame(frame), function(err, res) {
    if (err) 
      throw(err);
    else{
//      console.log("written bytes: "+util.inspect(res));
    }
  });
}

// XBee Command set
var AT_COMMAND_RESPONSE                 = 0x88
var ZIGBEE_TRANSMIT_STATUS              = 0x8B
var ZIGBEE_EXPLICIT_RX_INDICATOR        = 0x91
var EXPLICIT_ZIGBEE_COMMAND_FRAME       = 0x11

// ZCL Cluster ID
var ZB_MATCH_DESCRIPTOR_REQUEST         = 0x0006
var ZB_MATCH_DESCRIPTOR_RESPONSE        = 0x8006
var ZB_DEVICE_ANNOUNCE                  = 0x0013
var ZB_MANAGEMENT_LEAVE_REQUEST         = 0x0034
var ZB_IAS_ZONE                         = 0x0500

// ZCL Profile ID
var ZB_SIMPLE_DESCRIPTOR                = 0x0000
var ZB_HOME_AUTOMATION                  = 0x0104

// ZCL Command ID
var ZB_ZONE_ENROLL_REQUEST              = 0x01
var ZB_ZONE_STATUS_CHANGE_NOTIFICATION  = 0x00

// IAS Zone Maskt
var ZB_IAS_ZONE_ALARM1_MASK             = 1
var ZB_IAS_ZONE_ALARM2_MASK             = 2
var ZB_IAS_ZONE_TAMPER_MASK             = 4
var ZB_IAS_ZONE_BATTERY_MASK            = 8
var ZB_IAS_ZONE_SUPERVISION_MASK        = 16
var ZB_IAS_ZONE_RESTORE_MASK            = 32
var ZB_IAS_ZONE_TROUBLE_MASK            = 64
var ZB_IAS_ZONE_AC_MAIN_MASK            = 128

var handle_ZB_Explicit_Rx_Indicator = function (frame){
    console.log('data> '+util.inspect(frame.data))
    // Get destination endpoint
    var ds_ep = frame.data[0].toString(16)  
    console.log("DSEP> 0x"+ds_ep);
    // Get Cluster ID
    var cl_id = frame.data[1]<<8;
    cl_id = cl_id + frame.data[2];   
    console.log("CLID> 0x"+cl_id.toString(16));
    // Get Profile ID
    var pf_id = frame.data[3]<<8;
    pf_id = pf_id + frame.data[4];
    console.log("PFID> 0x"+pf_id.toString(16));
    console.log("ADDR> 0x"+frame.remote64);
    
    // Handle Different Cluster ID and Profile ID
    switch(pf_id){
        case ZB_SIMPLE_DESCRIPTOR:
            switch(cl_id){
                case ZB_MATCH_DESCRIPTOR_REQUEST:
                    console.log('=>Match Descriptor Request');
                    var match_descriptor_resp = {
                      type: EXPLICIT_ZIGBEE_COMMAND_FRAME,
                      destination64: frame.remote64,
                      destination16: frame.remote16,
                      sourceEndpoint: 0,
                      destinationEndpoint: 0x0,
                      clusterId: ZB_MATCH_DESCRIPTOR_RESPONSE,
                      profileId: ZB_SIMPLE_DESCRIPTOR,
                      data: [frame.data[6], 0x00, g_COORDINATOR_ADDR16_LSB, g_COORDINATOR_ADDR16_MSB, 0x01, g_COORDINATOR_ENDPOINT]
                    }
                    sendAPI(match_descriptor_resp)
                    break;
                case ZB_DEVICE_ANNOUNCE:
                    console.log('=>Device Announce')
                    break;
                case ZB_MANAGEMENT_LEAVE_REQUEST:
                    console.log('=>Management Leave Request')
                    
                    break;
                default:
                    break;
            }
            break;
        case ZB_HOME_AUTOMATION:
            var cm_id = frame.data[8]
//            console.log('=>Command ID: '+cm_id)
            switch(cm_id){
                case ZB_ZONE_ENROLL_REQUEST:
                    console.log('=>Zone Enroll Request')
                    // New device enroll request
                    // Add the device to the node list
                    API_POST_NODE(frame.remote16, frame.remote64)
                    break;
                case ZB_ZONE_STATUS_CHANGE_NOTIFICATION:
                    console.log('=>Zone Status Change')
                    var status = frame.data[9]
//                    console.log('=>Status ID: '+status)
                    if(status & ZB_IAS_ZONE_ALARM1_MASK){
                        console.log('>>Alarm1<<')
                    }
                    if(status & ZB_IAS_ZONE_ALARM2_MASK){
                        console.log('>>Alarm2<<')
                    }
                    if(status & ZB_IAS_ZONE_TAMPER_MASK){
                        console.log('>>Tamper<<')
                    }
                    if(status & ZB_IAS_ZONE_BATTERY_MASK){
                        console.log('>>Battery Weak<<')
                    }
                    if(status & ZB_IAS_ZONE_SUPERVISION_MASK){
                        console.log('>>Supervision<<')
                    }
                    if(status & ZB_IAS_ZONE_RESTORE_MASK){
                        console.log('>>Restore Report<<')
                    }
                    if(status & ZB_IAS_ZONE_TROUBLE_MASK){
                        console.log('>>Trouble<<')
                    }
                    if(status & ZB_IAS_ZONE_AC_MAIN_MASK){
                        console.log('>>AC Main Fail<<')
                    }
                    break;
                default:
                    break;
            }
            break;
        default:
            break;
    }
}

var API_POST_NODE = function (ADDR16, ADDR64){
    var args = {
        data: {
          'ADDR16': ADDR16,
          'MAC': ADDR64,
          'ADDR64': ADDR64
        },
        headers:{"Content-Type": "application/json"} 
    };
    client.post("http://127.0.0.1:3000/api/nodes", args, function(data,response) {
        // parsed response body as js object 
        // console.log(data);
        // raw response 
        console.log(response.statusCode);
    });
}

var API_DELETE_NODE = function (id){
    client.delete("http://127.0.0.1:3000/api/nodes"+id.toString, function(data,response) {
        // parsed response body as js object 
        // console.log(data);
        // raw response 
        console.log(response.statusCode);
    });
}


var handle_ZB_AT_Command_Response = function (frame){
    console.log('Command> '+frame.command)
    switch(frame.command){
        case 'ND':
            console.log('ADDR_16> '+frame.nodeIdentification.remote16)
            console.log('ADDR_64> '+frame.nodeIdentification.remote64)
            break;
        case 'CH':
//            console.log("OBJ> "+util.inspect(frame));
            console.log('Channel> '+util.inspect(frame.commandData[0]))
            sendATCommand('ND');
            break;
        default:
            break;
    }
}

xbeeAPI.on("frame_object", function(frame) {
    console.log("OBJ> "+(frame.type));
    switch (frame.type){
        case AT_COMMAND_RESPONSE:
            console.log('**AT Command Response**')
            handle_ZB_AT_Command_Response(frame);
            break;
        case ZIGBEE_EXPLICIT_RX_INDICATOR:
            console.log('**ZB Explicit Rx**')
            handle_ZB_Explicit_Rx_Indicator(frame);
            break;
        case ZIGBEE_TRANSMIT_STATUS:
            console.log('**ZB Transmit Successful')
            break;
        default:
            console.log('**ZB Message Rx**')
            break;
    }
});