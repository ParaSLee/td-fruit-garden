const api = require('../../utils/api');
Component({ data: { local: !api.cloudEnabled() } });
