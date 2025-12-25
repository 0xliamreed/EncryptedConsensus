import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { Contract } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import '../styles/PredictionApp.css';

type PredictionRecord = {
  id: number;
  title: string;
  options: string[];
  encryptedCounts: `0x${string}`[];
  isActive: boolean;
  resultsArePublic: boolean;
  createdAt: number;
  closedAt: number;
  hasVoted: boolean;
  decryptedCounts?: number[];
};

// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

export function PredictionApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [decryptingId, setDecryptingId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [formTitle, setFormTitle] = useState('');
  const [formOptions, setFormOptions] = useState<string[]>(['', '']);

  const { data: predictionCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPredictionCount',
    query: {
      refetchInterval: 12000,
      enabled: true,
    },
  });

  const totalPredictions = useMemo(() => Number(predictionCount ?? 0n), [predictionCount]);

  useEffect(() => {
    const fetchPredictions = async () => {
      if (!publicClient) return;
      // if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === ZERO_ADDRESS) return;

      setIsSyncing(true);
      try {
        if (!totalPredictions) {
          setPredictions([]);
          return;
        }

        const entries: PredictionRecord[] = [];
        for (let i = 0; i < totalPredictions; i++) {
          const raw = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getPrediction',
            args: [BigInt(i)],
          });

          const [title, options, encryptedCounts, isActive, resultsArePublic, createdAt, closedAt] = raw as [
            string,
            string[],
            `0x${string}`[],
            boolean,
            boolean,
            bigint,
            bigint,
          ];

          const hasVoted =
            address && isConnected
              ? ((await publicClient.readContract({
                  address: CONTRACT_ADDRESS,
                  abi: CONTRACT_ABI,
                  functionName: 'hasUserVoted',
                  args: [BigInt(i), address],
                })) as boolean)
              : false;

          entries.push({
            id: i,
            title,
            options,
            encryptedCounts,
            isActive,
            resultsArePublic,
            createdAt: Number(createdAt),
            closedAt: Number(closedAt),
            hasVoted,
          });
        }
        setPredictions(entries);
      } catch (err) {
        console.error('Failed to load predictions', err);
        setStatusMessage('Unable to fetch predictions. Please retry.');
      } finally {
        setIsSyncing(false);
      }
    };

    fetchPredictions();
  }, [address, isConnected, publicClient, refreshIndex, totalPredictions]);

  const updateFormOption = (index: number, value: string) => {
    setFormOptions(prev => prev.map((opt, idx) => (idx === index ? value : opt)));
  };

  const addFormOption = () => {
    if (formOptions.length >= 4) return;
    setFormOptions(prev => [...prev, '']);
  };

  const removeFormOption = (index: number) => {
    if (formOptions.length <= 2) return;
    setFormOptions(prev => prev.filter((_, idx) => idx !== index));
  };

  const resetForm = () => {
    setFormTitle('');
    setFormOptions(['', '']);
  };

  const createPrediction = async () => {
    if (!signerPromise) {
      setStatusMessage('Connect a wallet to create a prediction.');
      return;
    }
    // if (CONTRACT_ADDRESS === ZERO_ADDRESS) {
    //   setStatusMessage('Set the deployed contract address before creating predictions.');
    //   return;
    // }

    const trimmedOptions = formOptions.map(opt => opt.trim()).filter(Boolean);
    if (trimmedOptions.length < 2 || trimmedOptions.length > 4) {
      setStatusMessage('Please provide between 2 and 4 options.');
      return;
    }
    if (!formTitle.trim()) {
      setStatusMessage('Prediction title cannot be empty.');
      return;
    }

    setCreating(true);
    setStatusMessage('Submitting prediction...');

    try {
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createPrediction(formTitle.trim(), trimmedOptions);
      await tx.wait();

      setStatusMessage('Prediction created successfully.');
      resetForm();
      setRefreshIndex(prev => prev + 1);
    } catch (err) {
      console.error('Failed to create prediction', err);
      setStatusMessage('Creation failed. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const submitVote = async (predictionId: number, optionIndex: number) => {
    if (!signerPromise || !instance || !address) {
      setStatusMessage('Connect wallet and wait for Zama to initialize before voting.');
      return;
    }
    // if (CONTRACT_ADDRESS === ZERO_ADDRESS) {
    //   setStatusMessage('Set the deployed contract address before voting.');
    //   return;
    // }

    setVotingId(predictionId);
    setStatusMessage('Encrypting your choice...');

    try {
      const encryptedInput = await instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      encryptedInput.add32(optionIndex);
      const cipher = await encryptedInput.encrypt();

      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.submitVote(predictionId, cipher.handles[0], cipher.inputProof);
      await tx.wait();

      setStatusMessage('Vote submitted.');
      setRefreshIndex(prev => prev + 1);
    } catch (err) {
      console.error('Failed to submit vote', err);
      setStatusMessage('Voting failed. Please try again.');
    } finally {
      setVotingId(null);
    }
  };

  const closePrediction = async (predictionId: number) => {
    if (!signerPromise) {
      setStatusMessage('Connect a wallet before closing predictions.');
      return;
    }
    // if (CONTRACT_ADDRESS === ZERO_ADDRESS) {
    //   setStatusMessage('Set the deployed contract address before closing predictions.');
    //   return;
    // }

    setClosingId(predictionId);
    setStatusMessage('Closing prediction...');

    try {
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.closePrediction(predictionId);
      await tx.wait();

      setStatusMessage('Prediction closed and results unlocked.');
      setRefreshIndex(prev => prev + 1);
    } catch (err) {
      console.error('Failed to close prediction', err);
      setStatusMessage('Close action failed. Please retry.');
    } finally {
      setClosingId(null);
    }
  };

  const decryptResults = async (prediction: PredictionRecord) => {
    if (!instance) {
      setStatusMessage('Encryption service is still initializing.');
      return;
    }
    if (!prediction.resultsArePublic) {
      setStatusMessage('Results are not public yet.');
      return;
    }

    setDecryptingId(prediction.id);
    setStatusMessage('Requesting public decryption...');

    try {
      const response = await instance.publicDecrypt(prediction.encryptedCounts);
      const counts = prediction.encryptedCounts.map(handle => Number(response.clearValues[handle] ?? 0));
      setPredictions(prev =>
        prev.map(item => (item.id === prediction.id ? { ...item, decryptedCounts: counts } : item)),
      );
      setStatusMessage('Results decrypted.');
    } catch (err) {
      console.error('Failed to decrypt results', err);
      setStatusMessage('Unable to decrypt results right now.');
    } finally {
      setDecryptingId(null);
    }
  };

  const activePredictions = predictions.filter(p => p.isActive);

  return (
    <div className="prediction-app">
      <div className="content-shell">
        <div className="hero-panel">
          <div>
            <p className="eyebrow">Fully encrypted flow</p>
            <h1>Encrypted consensus builder</h1>
            <p className="lede">
              Create predictions, cast encrypted choices with Zama FHE, and unlock public results once the poll ends.
            </p>
            <div className="stats-row">
              <div className="stat-chip">
                <span className="stat-value">{totalPredictions}</span>
                <span className="stat-label">Predictions</span>
              </div>
              <div className="stat-chip">
                <span className="stat-value">{activePredictions.length}</span>
                <span className="stat-label">Open</span>
              </div>
              <div className="stat-chip">
                <span className="stat-value">{predictions.length - activePredictions.length}</span>
                <span className="stat-label">Closed</span>
              </div>
            </div>
          </div>
          <div className="status-block">
            <div className="status-heading">Network</div>
            <p className="status-text">Contract: {CONTRACT_ADDRESS}</p>
            <p className="status-text">
              Zama relayer: {zamaLoading ? 'initializing...' : zamaError ? 'unavailable' : 'ready'}
            </p>
            {statusMessage ? <p className="status-live">{statusMessage}</p> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Create</p>
              <h3>Launch a new prediction</h3>
              <p className="panel-subtitle">Set a title and 2-4 options. Votes remain encrypted until you close it.</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Prediction title</label>
              <input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Will layer-2 adoption double this quarter?"
              />
            </div>
            <div className="options-column">
              <div className="options-header">
                <label>Options</label>
                <button type="button" className="ghost" onClick={addFormOption} disabled={formOptions.length >= 4}>
                  + Add option
                </button>
              </div>
              {formOptions.map((opt, idx) => (
                <div className="option-row" key={idx}>
                  <input
                    value={opt}
                    onChange={e => updateFormOption(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                  />
                  {formOptions.length > 2 ? (
                    <button className="icon-button" type="button" onClick={() => removeFormOption(idx)}>
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="actions-row">
            <button
              className="primary"
              onClick={createPrediction}
              disabled={creating || !isConnected || zamaLoading}
            >
              {creating ? 'Creating...' : 'Create prediction'}
            </button>
            {zamaLoading ? <span className="note">Waiting for Zama SDK...</span> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Live board</p>
              <h3>Predictions</h3>
              <p className="panel-subtitle">
                Vote with encrypted inputs. Anyone can end a prediction and make the tally public.
              </p>
            </div>
            {isSyncing ? <span className="pill">Syncing...</span> : null}
          </div>

          {predictions.length === 0 ? (
            <p className="empty-state">No predictions yet. Be the first to create one.</p>
          ) : (
            <div className="prediction-grid">
              {predictions.map(prediction => (
                <div className="prediction-card" key={prediction.id}>
                  <div className="card-top">
                    <div>
                      <p className="eyebrow">Prediction #{prediction.id}</p>
                      <h4>{prediction.title}</h4>
                    </div>
                    <div className={`badge ${prediction.isActive ? 'success' : 'muted'}`}>
                      {prediction.isActive ? 'Active' : 'Closed'}
                    </div>
                  </div>

                  <div className="meta-row">
                    <span>Created: {formatTimestamp(prediction.createdAt)}</span>
                    <span>Closed: {prediction.closedAt ? formatTimestamp(prediction.closedAt) : '—'}</span>
                  </div>

                  <div className="options-grid">
                    {prediction.options.map((label, idx) => (
                      <div className="option-card" key={idx}>
                        <div className="option-label">
                          <span className="pill subtle">#{idx + 1}</span>
                          <span>{label}</span>
                        </div>

                        <div className="option-actions">
                          {prediction.resultsArePublic && prediction.decryptedCounts ? (
                            <div className="count-bubble">{prediction.decryptedCounts[idx]}</div>
                          ) : (
                            <div className="count-bubble muted">Encrypted</div>
                          )}
                          {prediction.isActive ? (
                            <button
                              className="secondary"
                              onClick={() => submitVote(prediction.id, idx)}
                              disabled={
                                votingId === prediction.id ||
                                prediction.hasVoted ||
                                zamaLoading ||
                                !isConnected
                              }
                            >
                              {prediction.hasVoted ? 'Voted' : votingId === prediction.id ? 'Submitting...' : 'Vote'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="card-actions">
                    {prediction.isActive ? (
                      <button
                        className="ghost"
                        onClick={() => closePrediction(prediction.id)}
                        disabled={closingId === prediction.id || zamaLoading}
                      >
                        {closingId === prediction.id ? 'Closing...' : 'End prediction'}
                      </button>
                    ) : (
                      <button
                        className="ghost"
                        onClick={() => decryptResults(prediction)}
                        disabled={decryptingId === prediction.id || zamaLoading}
                      >
                        {decryptingId === prediction.id ? 'Decrypting...' : 'Decrypt results'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
