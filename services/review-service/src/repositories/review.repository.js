'use strict';
const { pool } = require('../config/database');
function createReviewRepository(database = pool) {
  return { async create(input) {
    return (await database.query('INSERT INTO review(tid,cid,did,star,cmt) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [input.tripId,input.customerId,input.driverId,input.score,input.comment ?? null])).rows[0];
  } };
}
module.exports = { ...createReviewRepository(),createReviewRepository };
