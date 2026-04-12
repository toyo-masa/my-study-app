import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LoanSim } from '../components/LoanSim';

export const LoanSimRoute: React.FC = () => {
    const navigate = useNavigate();

    return <LoanSim onBack={() => navigate('/')} />;
};
