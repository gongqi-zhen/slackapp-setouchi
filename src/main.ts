function sendDailyReport(): void {
  console.info("START: sendDailyReport")
  try {
    const progress = getProgress();
    const msg = genDailyReportMessage(progress);
    sendMessage(msg);
    console.info("SUCCESS: sendDailyReport: " + `message[${msg}]`)
    writeSpreadSheetLog(progress);
  } catch (e) {
    console.error(`ERROR: ${e}`)
  }
}

function sendScrumReport(): void {
  console.info("START: sendScrumReport")
  try {
    const progress = getProgress();
    const msg = genScrumMessage(progress);
    sendMessage(msg);
    console.info("SUCCESS: sendScrumReport: " + `message[${msg}]`)
  } catch (e) {
    console.error(`ERROR: sendScrumReport: ${e}`)
  }
}


const getScriptProperty = (key: string): string => {
  const property = PropertiesService.getScriptProperties().getProperty(key);
  if (!property) throw Error("property is not found.");
  return property;
}

// Google Apps Scriptのプロパティに値を設定して下さい
const config = {
  SLACK_BOT_USER_ACCESS_TOKEN: getScriptProperty("SlackBotUserAccessToken"),
  SLACK_BOT_USER_ID: getScriptProperty("SlackBotUserID"),
  SLACK_CHANNEL_ID: getScriptProperty("SlackChannelID"),
  SLACK_MY_USER_ID: getScriptProperty("SlackMyUserID"),
  GOOGLE_SPREAD_SHEET_ID: getScriptProperty("GoogleSpreadSheetID"),
  GOOGLE_SPREAD_SHEET_SHARING_URL: getScriptProperty("GoogleSpreadSheetSharingUrl")
}

// reactionはslack workspaceに合わせて自由に変えて下さい
const reactionMap = {
  done: ":done:",
  doing: ":doing:",
  manabi: ":manabi:",
  memo: ":memo:",
  pr: ":pr:",
  end: ":otsukare:"
}

type progress = {
  doing: string[];
  done: string[];
  manabi: string[];
  memo: string[];
  pr: string[];
}

const getProgress = (): progress => {
  const payload = {
    token: config.SLACK_BOT_USER_ACCESS_TOKEN,
    channel: config.SLACK_CHANNEL_ID, limit: "400" }

  const res = UrlFetchApp.fetch("https://slack.com/api/conversations.history", {
    payload,
    method: "get",
  })

  const resJson = JSON.parse(res.getContentText())
  const messages = resJson.messages

  let progress: progress = {doing: [], done: [], manabi: [], memo: [], pr: []};
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.user == config.SLACK_BOT_USER_ID && msg.text.includes(reactionMap.end)) {
      break;
    }
    if (msg.user != config.SLACK_MY_USER_ID) {
      continue;
    }
    for (let key in reactionMap) {
      if (msg.text.includes(reactionMap[key])) {
        if (key == "end") {
          continue;
        }
        progress[key].push(msg.text.replace(`${reactionMap[key]}`, ''))
      }
    }
  }
  return progress
}

const sendMessage = (text: string): void => {
  if (text == "") {
    return
  }
  const payload = {
    token: config.SLACK_BOT_USER_ACCESS_TOKEN,
    channel: config.SLACK_CHANNEL_ID,
    text: text,
  }
  UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", {
    payload,
    method: "post",
  })
}

const writeSpreadSheetLog = (progress: progress):void => {
  try {
    console.info("START: writeSpreadSheetLog")
    const ssApp = SpreadsheetApp.openById(config.GOOGLE_SPREAD_SHEET_ID);
    const targetSheetName = getYearMonth()
    let sheet = ssApp.getSheetByName(targetSheetName)
    if (!sheet) {
      sheet = ssApp.insertSheet(targetSheetName, 0,{ template: ssApp.getSheetByName("log_sheet_template") })
    }
    const targetColumnName = getMonthDate()
    const lastColumn = sheet.getLastColumn()
    const log = genLog(progress)
    if (log == "") {
      console.info("SUCCESS: writeSpreadSheetLog: Log is Empty.")
      return
    }
    sheet.getRange(1, lastColumn+1).setValue(targetColumnName);
    sheet.getRange(2, lastColumn+1).setValue(log);
    const shareUrl = config.GOOGLE_SPREAD_SHEET_SHARING_URL
    sendMessage(`月間ログも追記しておいたよ！
${shareUrl}
`);
    console.info("SUCCESS: writeSpreadSheetLog: " + `log[${log}]`)
  } catch (e) {
    console.error(`ERROR: writeSpreadSheetLog: ${e}`)
  }
}

const getYearMonth = (): string => {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
}

const getMonthDate = (): string => {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MM/dd');
}

const genDailyReportMessage = (progress:progress): string => {
  if (progress.doing.length == 0 && 
      progress.done.length == 0 && 
      progress.manabi.length == 0 && 
      progress.memo.length == 0 && 
      progress.pr.length == 0
     ) { return "" }

  let doing = progress.doing.join('\n- ')
  let done = progress.done.join('\n- ')
  let manabi = progress.manabi.join('\n- ')
  let memo = progress.memo.join('\n- ')
  let prs = progress.pr.join('\n- ')

  return `デイリーレポートの時間だよ！
${reactionMap.doing} 今日進めたタスク
- ${doing}
${reactionMap.done}今日完了したタスク
- ${done}
${reactionMap.pr} Pull Requests
- ${prs}
${reactionMap.manabi} 今日の学び
- ${manabi}
${reactionMap.memo} メモ・リマインド・あしたのTodo
- ${memo}
今日も一日 ${reactionMap.end} (･ω･っ)З
`
}

const genScrumMessage = (progress:progress): string => {
  if (progress.doing.length == 0 && 
      progress.done.length == 0 && 
      progress.manabi.length == 0 && 
      progress.memo.length == 0 && 
      progress.pr.length == 0
     ) { return "" }

  let doing = progress.doing.join('\n- ')
  let done = progress.done.join('\n- ')
  let doneNum = progress.done.length

  let msg = ""
  if (doneNum > 0) {
    msg = `中間報告だよ！
やっていたこと
\`\`\`
- ${doing}
\`\`\`

今日これまでに完了したこと
\`\`\`
- ${done}
\`\`\``
  } else {
    msg = `中間報告だよ！
やっていたこと
\`\`\`
- ${doing}
\`\`\``
  }
  return msg
}

const genLog = (progress:progress): string => {
  if (progress.doing.length == 0 && 
      progress.done.length == 0 && 
      progress.manabi.length == 0 && 
      progress.memo.length == 0 && 
      progress.pr.length == 0
     ) { return "" }

  let doing = progress.doing.join('\n- ')
  let done = progress.done.join('\n- ')
  let manabi = progress.manabi.join('\n- ')
  let memo = progress.memo.join('\n- ')
  let prs = progress.pr.join('\n- ')

  return `
# 着手したタスク
- ${doing}
# 完了したタスク
- ${done}
# Pull Requests
- ${prs}
# 今日の学び
- ${manabi}
# メモ・リマインド・あしたのTodo
- ${memo}
`
}