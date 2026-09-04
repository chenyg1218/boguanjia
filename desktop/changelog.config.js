import { version } from './package.json'

const config = {
  types: {
    feat: {
      title: '🚀 新功能',
    },
    fix: {
      title: '🐞 问题修复',
    },
    refactor: false,
    docs: false,
    chore: false,
    style: false,
    types: false,
    build: false,
    test: false,
    ci: false,
  },
  output: 'CHANGELOG.md',
  noAuthors: true,
  newVersion: version,
}

export default config
