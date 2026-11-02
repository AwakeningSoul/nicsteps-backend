import { google } from "googleapis";

const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  : undefined;

const auth = new google.auth.GoogleAuth({
  ...(credentials ? { credentials } : {}),
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets"
  ]
});

export const sheets = google.sheets({
  version: "v4",
  auth
});

export const SPREADSHEETS = {
  registration: "1kk_CeNEQGNhbfRnyrFfzd0CaJD_rTSBLi70TCyrNRho",
  weeklyReports: "1ZjiBas4FSSsCst69eAq0ugkm5c9nKxNQPWXGIUILTvI",
  dashboard: "1Uu-0OhDP5G2OyONRGmfnd_U0sawIk5Bl-dwvbdEzz98"
};