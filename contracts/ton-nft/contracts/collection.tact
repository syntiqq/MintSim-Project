import "@stdlib/deploy";
import "./nft-item.tact";

// NOTE: MintTransfer is declared in nft-item.tact (imported above)
message Mint {
    queryId: Int as uint64;
    index:   Int as uint64;
    owner:   Address;
    content: Cell;
}

message Withdraw {
    amount:      Int as coins;
    destination: Address;
}

message UpdateContent {
    content: Cell;
}

struct CollectionData {
    nextItemIndex:     Int as uint64;
    collectionContent: Cell;
    owner:             Address;
}

struct RoyaltyParams {
    numerator: Int;
    denominator: Int;
    destination: Address;
}

message(0x693d3950) GetRoyaltyParams {
    query_id: Int as uint64;
}

message(0xa8cb00ad) ReportRoyaltyParams {
    query_id: Int as uint64;
    numerator: Int as uint16;
    denominator: Int as uint16;
    destination: Address;
}

contract Collection with Deployable {

    owner:             Address;
    nextItemIndex:     Int as uint64;
    collectionContent: Cell;
    royalty_params:    RoyaltyParams;


    init(owner: Address, collectionContent: Cell, royalty_params: RoyaltyParams) {
        self.owner             = owner;
        self.nextItemIndex     = 0;
        self.collectionContent = collectionContent;
        self.royalty_params    = royalty_params;
    }

    receive(msg: Slice) {
        // accept comment-bearing transfers
    }

    receive() {
        // accept plain empty transfers too
    }

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


    receive(msg: GetRoyaltyParams) {
        let ctx: Context = context();
        send(SendParameters{
            to: ctx.sender,
            value: 0,
            mode: SendRemainingValue, 
            bounce: false,
            body: ReportRoyaltyParams{
                query_id: msg.query_id,
                numerator: self.royalty_params.numerator,
                denominator: self.royalty_params.denominator,
                destination: self.royalty_params.destination
            }.toCell()
        });
    }

    receive(msg: Withdraw) {
        require(sender() == self.owner, "Only owner can withdraw");
        send(SendParameters{
            to:     msg.destination,
            value:  msg.amount,
            mode:   SendIgnoreErrors,
            bounce: false
        });
    }

    receive(msg: UpdateContent) {
        require(sender() == self.owner, "Only owner can update content");
        self.collectionContent = msg.content;
    }

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

    get fun royalty_params(): RoyaltyParams {
        return self.royalty_params;
    }
}