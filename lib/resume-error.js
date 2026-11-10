'use strict';

class ResumeError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ResumeError';
    this.code = code;
    this.status = status;
  }
}

module.exports = { ResumeError };
