import mqtt from 'mqtt';

export default class Devices {
  constructor(db, liveElpriser) {
    // Set database and live elpriser as class members.
    this.db = db;
    this.liveElpriser = liveElpriser;

    // Wait 2.5 seconds to give time to grab elpriser and establish db connection.
    setTimeout(() => {
      // Connect to MQTT    
      this.client = mqtt.connect('mqtt://localhost:1883', {username: "admin", password: process.env.MQTT_PWD});

      // Log to console and subscribe to required topics when MQTT broker connection is established.
      this.client.on("connect", () => {
        console.log('Connected to the MQTT broker');
        this.client.subscribe("device/+/state");
        this.client.subscribe("device/+/status");
      });
      
      // Log to console on MQTT errors, offline or reconnection.
      this.client.on("error", error => console.error("MQTT client error:", error));
      this.client.on("offline", () => console.log("MQTT client is offline"));
      this.client.on("reconnect", () => console.log("MQTT client is reconnecting"));

      // Runs on an incoming message
      this.client.on("message", async (topic, message) => {
        // Grab the device uuid and message topic.
        const [_, deviceUUID, messageType] = topic.split('/');

        // Grba the actual message
        const payload = message.toString();

        // For debugging
        console.log("message:", messageType, payload);

        // Update database when the on/off or connection state changes.
        if (messageType === 'state' || messageType === 'status') {
          this.updateDB(deviceUUID, messageType, payload);
        }
        
        // When a device connects
        if (messageType === 'status' && payload === 'connected') { 
          // Grab user eludbyder and device schedule from DB
          const statement = `SELECT devices.uuid, devices.schedule AS schedule, users.eludbyder AS eludbyder, users.id AS 'user_id'
          FROM devices
          INNER JOIN users ON devices.users_id=users.id
          WHERE devices.uuid = '${deviceUUID}';`;
          const response = await this.db.query(statement);
          
          // Send timestamp
          const timestampTopic = `device/${deviceUUID}/timestamp`;
          const timestamp = Math.floor(Date.now() / 1000).toString();
          this.client.publish(timestampTopic, timestamp);

          // Send elpriser
          const eludbyder = response[0]["eludbyder"];
          const elpriser = this.liveElpriser.data[eludbyder];
          this.publishElpriser(eludbyder, elpriser, deviceUUID);

          // Send schedule
          const scheduleTopic = `device/${deviceUUID}/schedule`;
          this.client.publish(scheduleTopic, response[0]["schedule"]);
        }
      });

      // Send elpriser to devices when new data comes from the LiveElpriser.
      this.liveElpriser.on("elpriser", ({eludbyder, elpriser}) => {
        this.publishElpriser(eludbyder, elpriser)
      });
    }, 2500);
  }

  // Used to update the database when a device state or status changes.
  async updateDB(uuid, msgType, msg) {
    console.log(uuid, msg);
    const column = (msgType === "status") ? "status" : "is_on";
    const value = (msgType === "status") ? `'${msg}'` : (msg === "on");
    const statement = `UPDATE \`devices\` SET \`${column}\` = ${value} WHERE \`uuid\` = '${uuid}';`;
    await this.db.query(statement);
  }

  // Sends elpriser to the device and updates the database when new data comes from the LiveElpriser.
  publishElpriser(eludbyder, elpriser, uuid = null) {
    // Convert DateTime strings to unix timestamps
    const unixTimestamps = elpriser.timestamps.map((timestamp) => {
      const date = new Date(timestamp.replace(' ', 'T') + ':00');

      // Convert the Date object to a Unix timestamp in seconds
      const unixTimestamp = Math.floor(date.getTime() / 1000);
      return unixTimestamp;
    });

    // Define the object to send to the device.
    const jsonPayload = JSON.stringify({
      "timestamps": unixTimestamps,
      "prices": elpriser.prices,
      "eludbyder": eludbyder
    });

    // Defines the appropriate topic based on wheter there is a UUID, then sends it to the device.
    const topic = (uuid === null) ? `elpriser/${eludbyder}` : `device/${uuid}/elpriser`;
    this.client.publish(topic, jsonPayload);
  }

  // Sends the schedule to the DB and device when a schedule change comes from the client.
  async sendSchedule(usrid, uuid, schedule) {
    const jsonSchedule = JSON.stringify(schedule);
    const statement = `SELECT devices.uuid, users.id AS 'user_id'
    FROM devices
    INNER JOIN users ON devices.users_id=users.id
    WHERE devices.uuid = '${uuid}';`;
    const response = await this.db.query(statement);

    if (response[0]["user_id"] === usrid) {
      const topic = `device/${uuid}/schedule`;
      this.client.publish(topic, jsonSchedule);

      const statement2 = `UPDATE devices SET schedule = '${jsonSchedule}' 
      WHERE uuid = '${uuid}';`;
      await this.db.query(statement2);
      return true;
    } else return false;
  }

  async getSchedule(usrid, uuid) {
    const statement = `SELECT devices.uuid, devices.schedule AS schedule, users.id AS 'user_id'
    FROM devices
    INNER JOIN users ON devices.users_id=users.id
    WHERE devices.uuid = '${uuid}';`;
    const response = await this.db.query(statement);
    if (response[0]["user_id"] === usrid) {
      return response[0]["schedule"];
    } else return null;
  }

  async updateInfo(usrid, uuid, info) {
    const statement = `SELECT devices.uuid, users.id AS 'user_id'
    FROM devices
    INNER JOIN users ON devices.users_id=users.id
    WHERE devices.uuid = '${uuid}';`;
    const response = await this.db.query(statement);
    if (response[0]["user_id"] === usrid) {
      let field = "";
      if (typeof(info) === "string") {
        field = "name";
      } else if (typeof(info) === "number") {
        field = "icon";
      }
      const statement2 = `UPDATE devices
      SET ${field} = "${info}"
      WHERE uuid="${uuid}"`;
      await this.db.query(statement2);
      return 200;
    } else return 403;
  }
}