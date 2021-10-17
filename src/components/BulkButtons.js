import { Button, Tooltip, Typography } from '@material-ui/core';
import { PublicKey } from '@solana/web3.js';
import { backOff } from 'exponential-backoff';
import React, { useState } from 'react';
import CSVReader from 'react-csv-reader';
import {
  useConnectionConfig
} from '../utils/connection';
import { useCallAsync, useSendTransaction } from '../utils/notifications';
import { useUpdateTokenName } from '../utils/tokens/names';
import { sleep } from '../utils/utils';
import {
  useBalanceInfo,
  useWallet
} from '../utils/wallet';

/**
 * Takes an array of callbacks which run the required transactions. Runs the callbacks with an exponential backoff in case of tx failure due to rate-limiting
 * @param {*} txs : Function[]
 */
const runBulkTxs = async (txs) => {
  let failCount = 0;
  let txNum = 0;

  for (const tx of txs) {
    await backOff(
      async () => {
        console.log(`Running tx number ${txNum}`);

        await tx();
        txNum++;
        return;
      },
      {
        //start delay for each tx is 100ms + exp backoff depending on number of failures so far
        startingDelay: failCount * 2 * 100 + 100,
        timeMultiple: 2,
        jitter: 'full',

        // handle the tx fail, return true if we should retry
        retry: (e) => {
          /*
           todo - this exponential backoff handler would work better if we only increment failCount when the error is actually related to being rate-limited .. e.g. if a tx fails because there was no balance or something, shouldn't be slowing down all the following txs - which is currently what would happen.

           pseudocode: if (error.type === 'rateLimited') return false;
          */


          console.log(
            `tx number ${txNum} failed, incrementing exponential backoff delay`,
          );
          failCount++;
          return true;
        },
      },
    );
  }

  console.log('Completed bulk txs');
};

export default function BulkButtons() {
  const wallet = useWallet();
  const updateTokenName = useUpdateTokenName();
  const { endpoint } = useConnectionConfig();
  const balanceInfo = useBalanceInfo(wallet.publicKey);
  const [sendTransaction, sending] = useSendTransaction();
  const callAsync = useCallAsync();
  const [csv, setCsv] = useState([]);

  const [overrideDestinationCheck, setOverrideDestinationCheck] = useState(
    false,
  );

  let { amount } = balanceInfo || {};

  async function makeTransaction2(address, qt, key, mint, decimal) {
    console.log('these are the decimals');

    let number = parseInt(decimal);

    if (new PublicKey(key).equals(wallet.publicKey)) {
      number = balanceInfo.decimals;
    }
    console.log(number);
    let amount = Math.round(parseFloat(qt) * 10 ** number);
    console.log(amount);
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    console.log('COIN');
    return wallet.transferToken(
      key,
      new PublicKey(address),
      amount,
      mint,
      number,
      null,
      overrideDestinationCheck,
    );
  }
  async function sendTransactionAuto(address, qt, key, mint, decimal) {
    await sleep(50);

    const txsig = await makeTransaction2(address, qt, key, mint, decimal);

    return await sendTransaction(
      txsig,
      address + ' - ' + qt + ' ' + qt + '\n',
      address + ' - ' + qt + ' ' + qt + '\n',
    );
  }

  async function bulkSend() {
    const doTx = async (csvRow) => {
      let [address, amount, key, mint, decimal] = csvRow.map((l) => {
        return l.trim();
      });
      console.log(address);
      //coin = coin.toUpperCase();

      //console.log(kz)
      console.log('Above is kz');

      //let key = kz[coin];
      // @ts-ignore
      let key_new = new PublicKey(key);
      console.log('this is the base 58 key below');
      console.log(key_new.toBase58());
      // @ts-ignore
      let mint_new = new PublicKey(mint);
      //console.log(key.toBase58())
      console.log('this is the key');
      //let mint = mints[coin];
      //console.log(coin)
      //Key should come from the file

      if (!address.toLowerCase().startsWith('0x')) {
        console.log('txn executing  for ', address);
        const txResult = sendTransactionAuto(
          address,
          amount,
          key_new,
          mint_new,
          decimal,
        );
        console.log('txn executed for ', address);
        return txResult;
      }

      return;
    };

    // tsx calls with callback if the tx fails
    const txs = csv.map((csvRow) => async () => {
      return doTx(csvRow);
    });

    await runBulkTxs(txs);

    return;
  }

  function upload() {
    callAsync(bulkSend(), {
      onSuccess: async () => { },
      successMessage: 'Success! ',
    });
  }
  const spacing = 24;
  return (
    <div style={{ display: 'flex', marginLeft: spacing }}>
      <Tooltip title={'Bulk Upload'}>
        <span>
          <Typography
            variant="h6"
            style={{
              flexGrow: 1,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
            hover={true}
            component="h2"
          >
            Upload a CSV bulk file
          </Typography>
          <CSVReader onFileLoaded={(data, fileInfo) => setCsv(data)} />
          <br></br>
          <Button variant="contained" color="primary" onClick={upload}>
            Upload
          </Button>
          <br></br>
        </span>
      </Tooltip>
    </div>
  );
}
