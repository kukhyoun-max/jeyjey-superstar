// logic.gs를 Node 시험에서 쓰기 위한 불러오기 파일. Apps Script로는 올리지 않는다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, 'logic.gs'), 'utf8');
const names = ['parseLink', 'tally', 'itemStatus', 'cardWord', 'canVote', 'shouldProduce', 'publicView', 'sortCards'];
const box = {};
vm.runInNewContext(`${code}\nthis.out={${names.join(',')}};`, box);
// 시험의 deepEqual이 다른 실행 공간의 객체를 비교할 수 있게 JSON으로 옮긴다.
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
module.exports = Object.fromEntries(names.map((n) => [n, (...a) => plain(box.out[n](...a.map(plain)))]));
