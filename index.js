var child_process = require('child_process');
var fs = require('fs');
var os = require('os');
var readline = require('readline');

var keypress = require('keypress');

var eol = require('os').EOL;
var exec = child_process.exec;

var cmd = 'hg --color always sl ' + process.argv.slice(2).join(' ');

var currentCommitMarker = '@';

var output;
var commitPos;
var bookmarkIndex;
var rebasing;
var rebasingPos;

exec(cmd, function(error, stdout, stderr) {
  output = stdout
    .replace(/\033\[(0;)?35m/g, '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  commitPos = search(1, [-1, 0], /^(\|\s)*@/, output);
  bookmarkIndex = indexOf(1, 0, '\033[0;33m', output[_line(commitPos)]);
  output[_line(commitPos)] = output[_line(commitPos)]
    .replace(/\033\[0;33m/, '\033[0;32m');
  render();
});

function render() {
  var colors = {};
  if (bookmarkIndex !== -1) {
    colors['\033[0;33m'] = [
      [_line(commitPos), bookmarkIndex + 7],
    ];
  }

  var lineAfter = lineAfterCommit();
  colors['\033[35m'] = colorMarkersForCommit(lineAfter);

  var toRender = insertAll(colors, output);
  markRebasePos(toRender);

  var numLinesToRender = process.stdout.rows;
  var numCharsToRender = process.stdout.columns;
  var to = Math.max(numLinesToRender, lineAfter + 1);
  process.stdout.write(
    '\033[2J' +
    '\033[0f' +
    '\033[0m' +

    toRender
      .slice(to - numLinesToRender, to - 1)
      .map(function (line) {return line.slice(0, numCharsToRender);})
      .join('\033[0m' + eol) +
    eol // ensure last line is empty
  );
}

function colorMarkersForCommit(lineAfter) {
  var markers = [];
  var to = lineAfter - _line(commitPos);
  var markers = [];
  for (var i = 0; i < to; i++) {
    markers.push(add(commitPos, [i, 2]));
  }
  return markers;
}

function markRebasePos(lines) {
  if (rebasing) {
    var line = lines[_line(rebasingPos)];
    var col = _col(rebasingPos);
    lines[_line(rebasingPos)] =
      line.slice(0, col) + '\033[0;1m←\033[0m' + line.slice(col + 1);
  }
}

// make `process.stdin` begin emitting "keypress" events
keypress(process.stdin);

// listen for the "keypress" event
process.stdin.on('keypress', function (ch, key) {
  if (!key) {
    return;
  }

  switch (key.name) {
    case 'up':
      updateCommit(-1);
      break;
    case 'down':
      updateCommit(1);
      break;
    case 'left':
      updateBookmark(-1);
      break;
    case 'right':
      updateBookmark(1);
      break;
    case 'return':
    case 'enter':
      finishCurrent();
      break;
    case 'u':
      finishParent();
      break;
    case 'r':
      rebaseFromCurrent();
      break;
  }
  if (key.ctrl && key.name == 'c'
      || key.name == 'q'
      || key.name == 'escape') {
    process.stdin.pause();
  }
});

process.stdin.setRawMode(true);
process.stdin.resume();

function updateCommit(direction) {
  commitPos =
    search(direction, commitPos, /^(\|\s)*[o@]/, output) || commitPos;
  bookmarkIndex = indexOf(1, 0, '\033[0;32m', output[_line(commitPos)]);
  render();
}

function lineAfterCommit() {
  var nextCommit = search(1, commitPos, /^(\|\s)*[o@]/, output);
  return nextCommit
    ? _line(nextCommit)
    : output.length;
}

function updateBookmark(direction) {
  var fromIndex = bookmarkIndex + direction;
  bookmarkIndex =
    indexOf(direction, fromIndex, '\033[0;32m', output[_line(commitPos)]);
  render();
}

function finishCurrent() {
  finish(function (to) {return to;});
}

function finishParent() {
  finish(function (to) {return to + '^';});
}

function finish(toModifier) {
  if (rebasing) {
    rebaseToCurrent(toModifier);
  } else {
    up(toModifier);
  }
}

function up(toModifier) {
  process.stdin.pause();
  // Use a tempfile unfortunately
  fs.writeFileSync('.____hg-sl-up-to', toModifier(currentTarget()));
}

function rebaseFromCurrent() {
  rebasing = currentTarget();
  rebasingPos = commitPos;
  render();
}

function rebaseToCurrent(toModifier) {
  process.stdin.pause();
  var from = rebasing;
  var to = toModifier(currentTarget());
  // Use a tempfile unfortunately
  fs.writeFileSync('.____hg-sl-rebase-to',
    '-s' + ' ' + from + ' ' + '-d' + ' ' + to);
}

function currentTarget() {
  if (bookmarkIndex !== -1) {
    var bookmark = output[_line(commitPos)]
      .substring(bookmarkIndex)
      .match(/\033\[0;32m\s*([^\s\*]+)/)[1];

  } else {
    var commit = output[_line(commitPos)]
      .match(/\S{6,9}/)[0];
  }
  // Use a tempfile unfortunately
  return bookmark || commit;
}

function insertAll(whatWhere, to) {
  var inserted = to.slice();
  return Object.keys(whatWhere).reduce(function (to, what) {
    return insert(what, whatWhere[what], to);
  }, inserted);
}

function insert(what, positions, inserted) {
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    var oldLine = inserted[_line(pos)];
    inserted[_line(pos)] =
      oldLine.slice(0, _col(pos)) + what + oldLine.slice(_col(pos));
  }
  return inserted;
}

// fromPos != null
function search(direction, fromPos, pattern, where) {
  var len = where.length;
  var start = direction + _line(fromPos);
  for (var line = start; line < len && line >= 0; line += direction) {
    if ((column = where[line].search(pattern)) !== -1) {
      var prefix = where[line].match(pattern)[1] || '';
      return [line, column + prefix.length];
    }
  }
  return null;
}

// fromPos != null
function posOf(direction, fromPos, what, where) {
  var len = where.length;
  var fromCol = _col(fromPos);
  for (var line = _line(fromPos); line < len && line >= 0; line += direction) {
    if ((column = indexOf(direction, fromCol, what, where[line])) !== -1) {
      return [line, column];
    }
  }
  return null;
}

function indexOf(direction, fromIndex, what, where) {
  return direction === 1
    ? where.indexOf(what, fromIndex)
    : where.lastIndexOf(what, fromIndex);
}

function _col(pos) {
  return pos[1];
}

function _line(pos) {
  return pos[0];
}

function add(pos1, pos2) {
  return [_line(pos1) + _line(pos2), _col(pos1) + _col(pos2)];
}
