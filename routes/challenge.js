import express from "express";
import { sheets, SPREADSHEETS } from "../services/googleSheets.js";

const router = express.Router();

// Public NICSTEPS challenge leaderboard
router.get("/leaderboard", async (req, res) => {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEETS.dashboard,
      range: "'Public Leaderboard'!A2:D"
    });

    const rows = result.data.values || [];

    const leaderboard = rows
      .filter(row => row[0])
      .map(row => ({
        nickname: row[0],
        dailyTarget: row[1] || "",
        verifiedSteps: Number(row[2]) || 0,
        points: Number(row[3]) || 0
      }));

    res.json({
      success: true,
      leaderboard
    });
  } catch (error) {
    console.error("Leaderboard error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load the challenge leaderboard."
    });
  }
});

export default router;
