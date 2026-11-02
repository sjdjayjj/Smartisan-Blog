import { config, fields, collection } from '@keystatic/core';

export default config({
  storage: {
    kind: 'local',
  },
  collections: {
    posts: collection({
      label: '文章列表 (Articles)',
      slugField: 'title',
      path: 'src/content/posts/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: '文章标题' } }),
        date: fields.date({ label: '发布日期', defaultValue: { kind: 'today' } }),
        category: fields.select({
          label: '分类',
          options: [
            { label: '思考与架构', value: 'thinking' },
            { label: '系统折腾', value: 'system' },
            { label: '产品美学', value: 'aesthetic' },
          ],
          defaultValue: 'thinking',
        }),
        summary: fields.text({ label: '摘要', multiline: true }),
        content: fields.markdoc({ label: '正文内容' }),
      },
    }),
  },
});
