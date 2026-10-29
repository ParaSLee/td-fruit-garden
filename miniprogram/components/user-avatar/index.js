Component({
  properties: { user: { type: Object, value: {} }, large: Boolean },
  data: { failed: false },
  observers: { 'user.avatarUrl'() { this.setData({ failed: false }); } },
  methods: { imageFailed() { this.setData({ failed: true }); } }
});
