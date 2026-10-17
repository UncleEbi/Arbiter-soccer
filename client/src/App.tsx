import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Prediction {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  predictedWinner: string;
}

interface Match {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  status: 'scheduled' | 'live' | 'finished';
  liveStats?: {
    possession: number;
    shots: number;
    shotsOnTarget: number;
    corners: number;
    fouls: number;
  };
}

const API_BASE = 'http://localhost:3000';

function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/matches/upcoming`);
      setMatches(response.data.matches);
    } catch (err) {
      setError('Failed to fetch matches');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getPrediction = async (fixtureId: number) => {
    if (predictions[fixtureId]) return predictions[fixtureId];
    try {
      const response = await axios.get(`${API_BASE}/matches/${fixtureId}/prediction`);
      setPredictions(prev => ({ ...prev, [fixtureId]: response.data.prediction }));
      return response.data.prediction;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const updateLiveStats = async (fixtureId: number, stats: any) => {
    try {
      await axios.post(`${API_BASE}/matches/${fixtureId}/live-stats`, stats);
    } catch (err) {
      console.error(err);
    }
  };

  const recordResult = async (fixtureId: number, homeGoals: number, awayGoals: number) => {
    try {
      await axios.post(`${API_BASE}/matches/${fixtureId}/result`, {
        homeGoals,
        awayGoals,
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div>Loading matches...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '20px' }}>
        Football Prediction App
      </h1>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={fetchMatches}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          Refresh Matches
        </button>
      </div>

      <div>
        {matches.map((match) => (
          <div
            key={match.fixtureId}
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '15px',
              marginBottom: '15px',
              background: '#f9f9f9',
            }}
          >
            <h3 style={{ margin: '0 0 10px 0' }}>
              {match.homeTeam} vs {match.awayTeam}
            </h3>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <span>{match.homeTeam}</span>
              <span>{match.awayTeam}</span>
            </div>

            <button
              onClick={() => getPrediction(match.fixtureId)}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                marginBottom: '10px',
                cursor: 'pointer',
              }}
            >
              Get Prediction
            </button>

            {predictions[match.fixtureId] && (
              <div style={{ marginTop: '10px' }}>
                <h4>Win Probabilities</h4>
                <div style={{ margin: '5px 0' }}>
                  <strong>{match.homeTeam} win:</strong> {predictions[match.fixtureId].homeWinProbability}%
                </div>
                <div style={{ margin: '5px 0' }}>
                  <strong>Draw:</strong> {predictions[match.fixtureId].drawProbability}%
                </div>
                <div style={{ margin: '5px 0' }}>
                  <strong>{match.awayTeam} win:</strong> {predictions[match.fixtureId].awayWinProbability}%
                </div>
                <div style={{ margin: '5px 0', fontWeight: 'bold', color: '#2c3e50' }}>
                  Predicted Winner: {predictions[match.fixtureId].predictedWinner}
                </div>
              </div>
            )}

            {match.status === 'live' && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>
                Live: Possession {match.liveStats?.possession}%, Shots {match.liveStats?.shots}
              </div>
            )}

            {match.status === 'finished' && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>
                Finished
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;