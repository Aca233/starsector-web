import '../../ui/core/theme.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CampaignApp } from './CampaignApp';
import './campaign.css';
createRoot(document.getElementById('campaign-root')!).render(<React.StrictMode><CampaignApp /></React.StrictMode>);
