import type {
  MirrorablePublication,
  UnknownOpenActionModuleSettings
} from '@hey/lens';
import type { AllowedToken } from '@hey/types/hey';
import type { Address } from 'viem';

import Loader from '@components/Shared/Loader';
import { DEFAULT_COLLECT_TOKEN } from '@hey/data/constants';
import { TipIcon } from '@hey/icons';
import { useModuleMetadataQuery } from '@hey/lens';
import getAllTokens from '@hey/lib/api/getAllTokens';
import getAssetSymbol from '@hey/lib/getAssetSymbol';
import getRedstonePrice from '@hey/lib/getRedstonePrice';
import { RangeSlider, Select } from '@hey/ui';
import { useQuery } from '@tanstack/react-query';
import { type FC, useState } from 'react';
import toast from 'react-hot-toast';
import { CHAIN } from 'src/constants';
import useActOnUnknownOpenAction from 'src/hooks/useActOnUnknownOpenAction';
import { useUpdateEffect } from 'usehooks-ts';
import { encodeAbiParameters, formatUnits, parseUnits } from 'viem';
import { useAccount, useBalance } from 'wagmi';

import TipAction from './TipAction';

interface TipOpenActionModuleProps {
  module: UnknownOpenActionModuleSettings;
  publication: MirrorablePublication;
}

const TipOpenActionModule: FC<TipOpenActionModuleProps> = ({
  module,
  publication
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState<AllowedToken | null>(
    null
  );
  const [usdPrice, setUsdPrice] = useState(0);
  const [tip, setTip] = useState({
    currency: DEFAULT_COLLECT_TOKEN,
    value: [5]
  });

  const { address } = useAccount();

  const getUsdPrice = async () => {
    const usdPrice = await getRedstonePrice(
      getAssetSymbol(selectedCurrency?.symbol as string)
    );
    setUsdPrice(usdPrice);
  };

  useUpdateEffect(() => {
    getUsdPrice();
  }, [selectedCurrency]);

  const { data: balanceData } = useBalance({
    address,
    query: { refetchInterval: 2000 },
    token: selectedCurrency?.contractAddress as Address
  });

  const { data, loading } = useModuleMetadataQuery({
    skip: !Boolean(module?.contract.address),
    variables: { request: { implementation: module?.contract.address } }
  });

  const metadata = data?.moduleMetadata?.metadata;

  const { actOnUnknownOpenAction, isLoading } = useActOnUnknownOpenAction({
    signlessApproved: module.signlessApproved,
    successToast: "You've sent a tip!"
  });

  const { data: allowedTokens, isLoading: loadingAllowedTokens } = useQuery({
    queryFn: () =>
      getAllTokens((tokens) =>
        setSelectedCurrency(
          tokens.find(
            (token) => token.contractAddress === DEFAULT_COLLECT_TOKEN
          ) as AllowedToken
        )
      ),
    queryKey: ['getAllTokens']
  });

  if (loading || loadingAllowedTokens) {
    return (
      <div className="m-5">
        <Loader message="Loading tip..." />
      </div>
    );
  }

  const act = async () => {
    if (usdPrice === 0) {
      return toast.error('Failed to get USD price');
    }

    const abi = JSON.parse(metadata?.processCalldataABI);
    const currency = allowedTokens?.find(
      (token) => token.contractAddress === tip.currency
    );

    if (!currency) {
      return toast.error('Currency not supported');
    }

    const amount = tip.value[0];
    const usdValue = amount / usdPrice;

    const calldata = encodeAbiParameters(abi, [
      currency.contractAddress,
      parseUnits(usdValue.toString(), currency.decimals).toString()
    ]);

    return await actOnUnknownOpenAction({
      address: module.contract.address,
      data: calldata,
      publicationId: publication.id
    });
  };

  const balance = balanceData
    ? parseFloat(
        formatUnits(balanceData.value, selectedCurrency?.decimals as number)
      ).toFixed(selectedCurrency?.symbol === 'WETH' ? 4 : 2)
    : 0;

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="space-x-1 text-2xl">
            <span>$</span>
            <b>{tip.value[0]}</b>
          </span>
          <div className="ld-text-gray-500 text-sm">
            {(tip.value[0] / usdPrice).toFixed(
              selectedCurrency?.symbol === 'WETH' ? 4 : 2
            )}{' '}
            {selectedCurrency?.symbol}
          </div>
        </div>
        <div className="flex w-5/12 flex-col items-end space-y-1">
          <Select
            defaultValue={DEFAULT_COLLECT_TOKEN}
            onChange={(e) => {
              setTip({ ...tip, currency: e.target.value });
              setSelectedCurrency(
                allowedTokens?.find(
                  (token) => token.contractAddress === e.target.value
                ) as AllowedToken
              );
            }}
            options={allowedTokens?.map((token) => ({
              label: token.name,
              value: token.contractAddress
            }))}
          />
          <div className="ld-text-gray-500 text-sm">Balance: {balance}</div>
        </div>
      </div>
      <div className="pb-3 pt-5">
        <RangeSlider
          min={1}
          onValueChange={(value) => setTip({ ...tip, value })}
          value={tip.value}
        />
      </div>
      {selectedCurrency ? (
        <TipAction
          act={act}
          className="mt-5 w-full justify-center"
          icon={<TipIcon className="size-4" />}
          isLoading={isLoading}
          module={module}
          moduleAmount={{
            asset: {
              contract: {
                address: selectedCurrency.contractAddress,
                chainId: CHAIN.id
              },
              decimals: selectedCurrency.decimals,
              name: selectedCurrency.name,
              symbol: selectedCurrency.symbol
            },
            value: tip.value[0].toString()
          }}
          title="Send Tip"
        />
      ) : null}
    </div>
  );
};

export default TipOpenActionModule;
