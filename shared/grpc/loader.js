'use strict';

const fs = require('node:fs');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_ROOT = path.resolve(__dirname, '../../proto');

const LOADER_OPTIONS = Object.freeze({
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_ROOT],
});

function resolveProtoPath(protoFile) {
  if (!protoFile || typeof protoFile !== 'string') {
    throw new TypeError('protoFile must be a non-empty string');
  }

  const resolved = path.resolve(PROTO_ROOT, protoFile);
  const relative = path.relative(PROTO_ROOT, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Proto path escapes PROTO_ROOT: ${protoFile}`);
  }

  if (path.extname(resolved) !== '.proto') {
    throw new Error(`Expected a .proto file: ${protoFile}`);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Proto file not found: ${resolved}`);
  }

  return resolved;
}

function loadProto(protoFile) {
  const protoPath = resolveProtoPath(protoFile);

  const packageDefinition = protoLoader.loadSync(
    protoPath,
    LOADER_OPTIONS,
  );

  return grpc.loadPackageDefinition(packageDefinition);
}

function getPackage(protoFile, packageName) {
  if (!packageName || typeof packageName !== 'string') {
    throw new TypeError('packageName must be a non-empty string');
  }

  const loaded = loadProto(protoFile);

  const pkg = packageName
    .split('.')
    .reduce((current, segment) => {
      return current?.[segment];
    }, loaded);

  if (!pkg) {
    throw new Error(`gRPC package not found: ${packageName}`);
  }

  return pkg;
}

function getServiceConstructor(
  protoFile,
  packageName,
  serviceName,
) {
  const pkg = getPackage(protoFile, packageName);
  const ServiceConstructor = pkg?.[serviceName];

  if (!ServiceConstructor || !ServiceConstructor.service) {
    throw new Error(
      `gRPC service not found: ${packageName}.${serviceName}`,
    );
  }

  return ServiceConstructor;
}

function getServiceDefinition(
  protoFile,
  packageName,
  serviceName,
) {
  return getServiceConstructor(
    protoFile,
    packageName,
    serviceName,
  ).service;
}

function createClient({
  protoFile,
  packageName,
  serviceName,
  address,
  credentials = grpc.credentials.createInsecure(),
  channelOptions = {},
}) {
  if (!address || typeof address !== 'string') {
    throw new TypeError('address must be a non-empty string');
  }

  const ServiceConstructor = getServiceConstructor(
    protoFile,
    packageName,
    serviceName,
  );

  return new ServiceConstructor(
    address,
    credentials,
    channelOptions,
  );
}

function createServer(options = {}) {
  return new grpc.Server(options);
}

module.exports = {
  grpc,
  PROTO_ROOT,
  LOADER_OPTIONS,
  resolveProtoPath,
  loadProto,
  getPackage,
  getServiceConstructor,
  getServiceDefinition,
  createClient,
  createServer,
};