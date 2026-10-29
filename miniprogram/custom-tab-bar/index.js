Component({
  data: { selected: 0, items: [{ title: '今日', icon: '⌂', path: '/pages/today/index' }, { title: '小队', icon: '♧', path: '/pages/team/index' }, { title: '战绩', icon: '▥', path: '/pages/stats/index' }, { title: '我的', icon: '◉', path: '/pages/profile/index' }] },
  methods: { change(event) { const index = Number(event.currentTarget.dataset.index); if (index !== this.data.selected) wx.switchTab({ url: this.data.items[index].path }); } }
});
