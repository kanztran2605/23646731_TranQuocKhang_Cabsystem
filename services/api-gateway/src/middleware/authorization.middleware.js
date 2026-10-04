'use strict';

const { AppError } = require('../../../../shared/errors/app-error');

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(AppError.forbidden());
    next();
  };
}

module.exports = { requireRole };
