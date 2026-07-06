import "@stdlib/deploy";
import "./nft-item.tact";

// NOTE: MintTransfer is declared in nft-item.tact (imported above) — it's the
// message Collection sends to a freshly-deployed NftItem to finalize it.

// Admin-only (backend, via DEPLOYER_MNEMONIC): actually creates one NFT.
message Mint {
    queryId: Int as uint64;
    index:   Int as uint64;
    owner:   Address;
    content: Cell;
}

// Admin-only: withdraw collected payments out of the contract.
message Withdraw {
    amount:      Int as coins;
    destination: Address;
}

// Admin-only: update collection metadata URI.
message UpdateContent {
    content: Cell;
}

struct CollectionData {
    nextItemIndex:     Int as uint64;
    collectionContent: Cell;
    owner:             Address;
}

contract Collection with Deployable {

    owner:             Address;
    nextItemIndex:     Int as uint64;
    collectionContent: Cell;

    init(owner: Address, collectionContent: Cell) {
        self.owner             = owner;
        self.nextItemIndex     = 0;
        self.collectionContent = collectionContent;
    }

    // ── Payment intake
    receive(msg: Slice) {
        // accept comment-bearing transfers — handled off-chain by backend
    }

    receive() {
        // accept plain empty transfers too
    }

    // ── Admin mint (backend-triggered)
    receive(msg: Mint) {
        require(sender() == self.owner, "Only owner can mint");
        require(msg.index == self.nextItemIndex, "Wrong index — out of sync with chain");

        let nftInit: StateInit = initOf NftItem(myAddress(), msg.index);

        send(SendParameters{
            to:     contractAddress(nftInit),
            value:  ton("0.03"),
            mode:   SendIgnoreErrors,
            bounce: false,
            body: MintTransfer{
                queryId: msg.queryId,
                owner:   msg.owner,
                content: msg.content
            }.toCell(),
            code: nftInit.code,
            data: nftInit.data
        });

        self.nextItemIndex = self.nextItemIndex + 1;
    }

    // ── Admin withdraw
    receive(msg: Withdraw) {
        require(sender() == self.owner, "Only owner can withdraw");
        send(SendParameters{
            to:     msg.destination,
            value:  msg.amount,
            mode:   SendIgnoreErrors,
            bounce: false
        });
    }

    // ── Admin update collection metadata 
    receive(msg: UpdateContent) {
        require(sender() == self.owner, "Only owner can update content");
        self.collectionContent = msg.content;
    }

    // ── TEP-62 standard getters
    get fun get_collection_data(): CollectionData {
        return CollectionData{
            nextItemIndex:     self.nextItemIndex,
            collectionContent: self.collectionContent,
            owner:             self.owner
        };
    }

    get fun get_nft_address_by_index(index: Int): Address {
        let nftInit: StateInit = initOf NftItem(myAddress(), index);
        return contractAddress(nftInit);
    }

    get fun nextItemIndex(): Int { return self.nextItemIndex; }
    get fun owner(): Address     { return self.owner; }

    get fun get_nft_content(index: Int, individualContent: Cell): Cell {
        return individualContent;
    }
}
