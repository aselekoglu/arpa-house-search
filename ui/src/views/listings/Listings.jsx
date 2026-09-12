import React, { useEffect, useMemo, useState } from 'react';
import { Banner, Spin } from '@douyinfe/semi-ui';
import noImage from '../../assets/no_image.jpg';
import {
  ArpaBadge,
  ArpaPageHeader,
  ArpaPanel,
  ArpaSelect,
} from '../../components/arpa/index.js';
import { getListingFeed } from '../../services/listingFeed.js';
import { listSearchProfiles } from '../../services/searchProfiles.js';
import ListingMap from './ListingMap.jsx';
import {
  LISTING_FEED_SORT_OPTIONS,
  formatListingFreshness,
  formatListingPrice,
  listingFeedErrorMessage,
} from './listingFeedModel.js';
import { listingCanonicalId } from './listingMapModel.js';
import './Listings.less';

const listingTitle = (listing) =>
  listing.title || listing.address || 'Rental listing';

const listingFacts = (listing) => {
  const facts = [];
  if (Number.isFinite(listing.beds)) facts.push(`${listing.beds} bed`);
  if (Number.isFinite(listing.baths)) facts.push(`${listing.baths} bath`);
  return facts;
};

export default function Listings() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [sort, setSort] = useState('newest');
  const [listings, setListings] = useState([]);
  const [selectedListingId, setSelectedListingId] = useState(null);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [error, setError] = useState(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  useEffect(() => {
    let active = true;
    listSearchProfiles()
      .then((result) => {
        if (!active) return;
        const nextProfiles = Array.isArray(result) ? result : [];
        setProfiles(nextProfiles);
        setSelectedProfileId((current) => current || nextProfiles[0]?.id || '');
      })
      .catch((cause) => {
        if (active) setError(listingFeedErrorMessage(cause));
      })
      .finally(() => {
        if (active) setProfilesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProfileId) {
      setListings([]);
      setSelectedListingId(null);
      setFeedLoading(false);
      return undefined;
    }

    let active = true;
    setFeedLoading(true);
    setError(null);

    getListingFeed({ profileId: selectedProfileId, sort })
      .then((result) => {
        if (!active) return;
        const nextListings = Array.isArray(result) ? result : [];
        setListings(nextListings);
        setSelectedListingId((current) => {
          if (
            current &&
            nextListings.some((listing) => listingCanonicalId(listing) === current)
          ) {
            return current;
          }
          return listingCanonicalId(nextListings[0]) ?? null;
        });
      })
      .catch((cause) => {
        if (active) {
          setListings([]);
          setSelectedListingId(null);
          setError(listingFeedErrorMessage(cause));
        }
      })
      .finally(() => {
        if (active) setFeedLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedProfileId, sort]);

  useEffect(() => {
    if (!selectedListingId) return;
    const card = document.querySelector(`[data-listing-id="${selectedListingId}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedListingId]);

  if (profilesLoading) {
    return (
      <div className="listingFeed__status">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="listingFeed">
      <ArpaPageHeader
        eyebrow="CANONICAL RENTAL FEED"
        title="Listings"
        subtitle="Realtor.ca and Custom Source rentals normalized into one Search Profile feed."
      />

      {error ? <Banner type="danger" closeIcon={null} description={error} /> : null}

      {profiles.length === 0 ? (
        <ArpaPanel className="listingFeed__status">
          Create a Search Profile before browsing canonical listings.
        </ArpaPanel>
      ) : (
        <>
          <div className="listingFeed__controls">
            <label className="listingFeed__field">
              <span className="listingFeed__fieldLabel">Search Profile</span>
              <ArpaSelect
                value={selectedProfileId}
                onChange={setSelectedProfileId}
                options={profiles.map((profile) => ({
                  value: profile.id,
                  label: `${profile.name} — ${profile.city}, ${profile.region}`,
                }))}
              />
            </label>

            <label className="listingFeed__field">
              <span className="listingFeed__fieldLabel">Sort listings</span>
              <ArpaSelect
                value={sort}
                onChange={setSort}
                options={LISTING_FEED_SORT_OPTIONS}
              />
            </label>
          </div>

          {selectedProfile ? (
            <div className="listingFeed__facts" aria-label="Selected Search Profile">
              <span>{selectedProfile.city}, {selectedProfile.region}</span>
              <span>{listings.length} listings</span>
            </div>
          ) : null}

          {feedLoading ? (
            <div className="listingFeed__status">
              <Spin size="large" />
            </div>
          ) : listings.length === 0 ? (
            <ArpaPanel className="listingFeed__status">
              No listings found for this Search Profile
            </ArpaPanel>
          ) : (
            <div className="listingFeed__workspace">
              <div className="listingFeed__grid">
                {listings.map((listing) => {
                  const facts = listingFacts(listing);
                  const id = listingCanonicalId(listing);
                  const selected = id === selectedListingId;
                  return (
                    <article
                      className={`listingFeed__card ${selected ? 'listingFeed__card--selected' : ''}`.trim()}
                      key={id}
                      data-listing-id={id}
                      onClick={() => setSelectedListingId(id)}
                    >
                      <div className="listingFeed__imageWrap">
                        <img
                          className="listingFeed__image"
                          src={listing.imageUrl || noImage}
                          alt=""
                          loading="lazy"
                          onError={(event) => {
                            if (event.currentTarget.src !== noImage) event.currentTarget.src = noImage;
                          }}
                        />
                        <div className="listingFeed__freshness">
                          <ArpaBadge>{formatListingFreshness(listing.firstSeen)}</ArpaBadge>
                        </div>
                      </div>

                      <div className="listingFeed__body">
                        <div className="listingFeed__meta">
                          <strong className="listingFeed__price">
                            {formatListingPrice(listing.price, listing.currency)}
                          </strong>
                          <span className="listingFeed__source">{listing.sourceLabel}</span>
                        </div>

                        <h2 className="listingFeed__title">{listingTitle(listing)}</h2>

                        {facts.length > 0 ? (
                          <div className="listingFeed__facts">
                            {facts.map((fact) => <span key={fact}>{fact}</span>)}
                          </div>
                        ) : null}

                        <p className="listingFeed__address">
                          {listing.address || 'Address unavailable'}
                        </p>

                        <div className="listingFeed__footer">
                          <a
                            className="listingFeed__link"
                            href={listing.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open listing
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <ListingMap
                listings={listings}
                selectedListingId={selectedListingId}
                onSelectListing={setSelectedListingId}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
