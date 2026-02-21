import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DistributionSimulator } from '../components/DistributionSimulator';

export const DistributionRoute: React.FC = () => {
    const navigate = useNavigate();

    return <DistributionSimulator onBack={() => navigate('/')} />;
};
