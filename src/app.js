import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = path.resolve(__dirname, '..', 'config', '.env');
await config({ path: envPath });

import express from 'express';
import jwt from 'jsonwebtoken';

import DbConnect from './db-connect.js';
import Elpriser from './live-elpriser.js';
import Auth from './auth.js';
import Devices from './devices.js';

const ip = "3.67.82.109";

const app = express();
const port = 8080;

const db = new DbConnect();
const liveElpriser = new Elpriser();
const auth = new Auth(db);
const devices = new Devices(db, liveElpriser);

app.use(express.json());

function authorize(bearer) {
  try {
    const token = bearer.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.userId;
  } catch (error) {
    return null;
  }
}

app.get('/elpriser/:udbyder', (req, res) => {
  try {
    let priser = liveElpriser.data[req.params.udbyder] ?? null;
    if (priser == null) res.status(404).send();
    res.status(200).send(priser);
  } catch {
    res.status(500).send();
  }
});

app.post('/user/signup', async (req, res) => {
  try {
    res.status(200).send(await auth.signup(req.body));
  } catch {
    res.status(500).send();
  }
});

app.post('/user/login', async (req, res) => {
  try {
    res.status(200).send(await auth.login(req.body));
  } catch {
    res.status(500).send();
  }
});

app.get('/user/eludbyder', async (req, res) => {
  try {
    const userId = authorize(req.headers.authorization);
    if (userId === null) {
      res.status(401).send();
    } else {
      res.status(200).send(await auth.getEludbyder(userId));
    }
  } catch {
    res.status(500).send();
  }
});

app.post('/user/eludbyder', async (req, res) => {
  try {
    const userId = authorize(req.headers.authorization);
    if (userId === null) {
      res.status(401).send();
    } else {
      const eludbyder = req.body["eludbyder"];
      await auth.setEludbyder(userId, eludbyder);
      res.status(200).send();
    }
  } catch (error) {
    res.status(500).send();
  }
})

app.get('/user/devices', async (req, res) => {
  try {
    const userId = authorize(req.headers.authorization);
    if (userId === null) {
      res.status(401).send();
    } else {
      let devices = await auth.getDevices(userId);
      res.status(200).send(devices);
    }
  } catch (err) {
    res.status(500).send();
  }
});

app.get('/device/:uuid/schedule', async (req, res) => {
  try {
    const userId = authorize(req.headers.authorization);
    if (userId === null) {
      res.status(401).send();
    } else {
      const schedule = await devices.getSchedule(userId, req.params.uuid);
      if (schedule === null) {
        res.status(403).send()
      } else {
        res.status(200).send(schedule);
      }
    }
  } catch (err) {
    res.status(500).send();
  }
});

app.post('/device/:uuid/schedule', async (req, res) => {
  try {
    const userId = authorize(req.headers.authorization);
    if (userId === null) {
      res.status(401).send();
    } else {
      const success = await devices.sendSchedule(userId, req.params.uuid, req.body["schedule"]);
      if (success) {
        res.status(200).send();
      } else {
        res.status(403).send();
      }
    }
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
});

app.patch('/device/:uuid/info', async (req, res) => {
  try {
    const userId = authorize(req.headers.authorization);
    if (userId === null) {
      res.status(401).send();
    } else {
      const info = (req.body["info"] === "name" ? req.body["name"] : req.body["icon"])
      const resStatus = await devices.updateInfo(userId, req.params.uuid, info);
      res.status(resStatus).send();
    }
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
});

app.listen(port, () => {
  console.log(`Server is running on \x1b[32mhttp://${ip}:${port}/\x1b[0m`);
});
