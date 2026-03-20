import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DistributionTables } from '../components/DistributionTables';

export const DistributionTablesRoute: React.FC = () => {
    const navigate = useNavigate();

    return <DistributionTables onBack={() => navigate('/')} />;
};
