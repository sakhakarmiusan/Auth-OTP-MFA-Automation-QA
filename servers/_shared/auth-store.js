function createStores() {
  return {
    users: new Map(),
    pending: new Map()
  };
}

module.exports = { createStores };

