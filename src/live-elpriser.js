import schedule from 'node-schedule';
import request from 'request';
import querystring from 'querystring';
import papa from 'papaparse';
import { EventEmitter } from 'events';

export default class Elpriser extends EventEmitter {
  constructor() {
    super();
    const rule = new schedule.RecurrenceRule();
    rule.hour = new schedule.Range(0, 23);
    rule.minute = 0;
    rule.second = 2;

    const job = schedule.scheduleJob(rule, this.update.bind(this));

    this.update();
  }

  data = {
    andelenergiØst: {},
    andelenergiVest: {},
  }

  formatDate(date) {
    return date.toISOString().substring(0, 10);
  }

  update() {
    this.andelenergi("east");
    this.andelenergi("west");
    console.log('Elpriser updated at:', new Date());
  }

  andelenergi(region) {
    const today = new Date();
    const date = this.formatDate(today);
    const endDate = this.formatDate(new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000));
    const productId = region === 'west' ? '0#0#10001' : '0#0#20001';

    const queryParams = querystring.stringify({
      obexport_format: 'csv',
      obexport_start: date,
      obexport_end: endDate,
      obexport_region: region,
      obexport_tax: '0',
      obexport_product_id: productId,
    });
    
    request(`http://andelenergi.dk/?${queryParams}`, (err, res, body) => {
      if (err) { console.log(err); }
      papa.parse(body, {
        header: true,
        complete: (results) => {
          const data = {
            timestamps: [],
            prices: [],
          }
          for (let i = 0; i < results.data.length; i++) {
            if (results.data[i]["Total"] === undefined) { continue; }
            const date = results.data[i]["Start"];
            let timestamp = `${date.substring(6,10)}-${date.substring(3,5)}-${date.substring(0,2)} ${date.substring(13,18)}`
            if (Date.parse(timestamp) < Date.now() - 3600000) { continue; } // continues if timestamp is before current hour
            data.timestamps = [timestamp, ...data.timestamps];
            const price = parseFloat(results.data[i]["Total"].replace(',', '.'));
            data.prices = [price, ...data.prices];
          }
          const dataName = region === "east" ? "andelenergiØst" : "andelenergiVest"
          if (data.timestamps.length >= this.data[dataName]?.timestamps?.length ?? 0) {
            this.emit("elpriser", {eludbyder: dataName, elpriser: data});
          }
          this.data[dataName] = data;
        },
      });
    });
  }
}