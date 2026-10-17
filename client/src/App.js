"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const axios_1 = __importDefault(require("axios"));
const API_BASE = 'http://localhost:3000';
function App() {
    const [matches, setMatches] = (0, react_1.useState)([]);
    const [predictions, setPredictions] = (0, react_1.useState)({});
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        fetchMatches();
    }, []);
    const fetchMatches = async () => {
        try {
            setLoading(true);
            const response = await axios_1.default.get(`${API_BASE}/matches/upcoming`);
            setMatches(response.data.matches);
        }
        catch (err) {
            setError('Failed to fetch matches');
            console.error(err);
        }
        finally {
            setLoading(false);
        }
    };
    const getPrediction = async (fixtureId) => {
        if (predictions[fixtureId])
            return predictions[fixtureId];
        try {
            const response = await axios_1.default.get(`${API_BASE}/matches/${fixtureId}/prediction`);
            setPredictions(prev => ({ ...prev, [fixtureId]: response.data.prediction }));
            return response.data.prediction;
        }
        catch (err) {
            console.error(err);
            return null;
        }
    };
    const updateLiveStats = async (fixtureId, stats) => {
        try {
            await axios_1.default.post(`${API_BASE}/matches/${fixtureId}/live-stats`, stats);
        }
        catch (err) {
            console.error(err);
        }
    };
    const recordResult = async (fixtureId, homeGoals, awayGoals) => {
        try {
            await axios_1.default.post(`${API_BASE}/matches/${fixtureId}/result`, {
                homeGoals,
                awayGoals,
            });
        }
        catch (err) {
            console.error(err);
        }
    };
    if (loading) {
        return (0, jsx_runtime_1.jsx)("div", { children: "Loading matches..." });
    }
    if (error) {
        return (0, jsx_runtime_1.jsxs)("div", { children: ["Error: ", error] });
    }
    return ((0, jsx_runtime_1.jsxs)("div", { style: { padding: '20px', fontFamily: 'Arial, sans-serif' }, children: [(0, jsx_runtime_1.jsx)("h1", { style: { textAlign: 'center', marginBottom: '20px' }, children: "Football Prediction App" }), (0, jsx_runtime_1.jsx)("div", { style: { marginBottom: '20px' }, children: (0, jsx_runtime_1.jsx)("button", { onClick: fetchMatches, style: {
                        padding: '10px 20px',
                        fontSize: '16px',
                        cursor: 'pointer',
                    }, children: "Refresh Matches" }) }), (0, jsx_runtime_1.jsx)("div", { children: matches.map((match) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        padding: '15px',
                        marginBottom: '15px',
                        background: '#f9f9f9',
                    }, children: [(0, jsx_runtime_1.jsxs)("h3", { style: { margin: '0 0 10px 0' }, children: [match.homeTeam, " vs ", match.awayTeam] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '10px',
                            }, children: [(0, jsx_runtime_1.jsx)("span", { children: match.homeTeam }), (0, jsx_runtime_1.jsx)("span", { children: match.awayTeam })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => getPrediction(match.fixtureId), style: {
                                width: '100%',
                                padding: '10px',
                                fontSize: '14px',
                                marginBottom: '10px',
                                cursor: 'pointer',
                            }, children: "Get Prediction" }), predictions[match.fixtureId] && ((0, jsx_runtime_1.jsxs)("div", { style: { marginTop: '10px' }, children: [(0, jsx_runtime_1.jsx)("h4", { children: "Win Probabilities" }), (0, jsx_runtime_1.jsxs)("div", { style: { margin: '5px 0' }, children: [(0, jsx_runtime_1.jsxs)("strong", { children: [match.homeTeam, " win:"] }), " ", predictions[match.fixtureId].homeWinProbability, "%"] }), (0, jsx_runtime_1.jsxs)("div", { style: { margin: '5px 0' }, children: [(0, jsx_runtime_1.jsx)("strong", { children: "Draw:" }), " ", predictions[match.fixtureId].drawProbability, "%"] }), (0, jsx_runtime_1.jsxs)("div", { style: { margin: '5px 0' }, children: [(0, jsx_runtime_1.jsxs)("strong", { children: [match.awayTeam, " win:"] }), " ", predictions[match.fixtureId].awayWinProbability, "%"] }), (0, jsx_runtime_1.jsxs)("div", { style: { margin: '5px 0', fontWeight: 'bold', color: '#2c3e50' }, children: ["Predicted Winner: ", predictions[match.fixtureId].predictedWinner] })] })), match.status === 'live' && ((0, jsx_runtime_1.jsxs)("div", { style: { marginTop: '10px', fontSize: '12px', color: '#555' }, children: ["Live: Possession ", match.liveStats?.possession, "%, Shots ", match.liveStats?.shots] })), match.status === 'finished' && ((0, jsx_runtime_1.jsx)("div", { style: { marginTop: '10px', fontSize: '12px', color: '#555' }, children: "Finished" }))] }, match.fixtureId))) })] }));
}
exports.default = App;
//# sourceMappingURL=App.js.map