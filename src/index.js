import dotenv from "dotenv";
import app from "./app.js";
import { runAbsenceMarking } from "./services/absenceJob.js";

dotenv.config();

if (process.env.VERCEL !== "1") {
  runAbsenceMarking();
}

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
