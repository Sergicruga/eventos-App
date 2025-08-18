import { StyleSheet, Dimensions } from 'react-native';

const CARD_MARGIN = 8;
const SEARCH_BAR_MARGIN = 20;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - SEARCH_BAR_MARGIN * 2 - CARD_MARGIN) / 2;
const CARD_HEIGHT = 235; // 135 image + 100 overlay

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f6fc',
    paddingTop: 18,
  },
  header: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#234567',
    marginBottom: 12,
    marginLeft: SEARCH_BAR_MARGIN,
    letterSpacing: 0.5,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6eaf3',
    borderRadius: 16,
    marginHorizontal: SEARCH_BAR_MARGIN,
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    elevation: 2,
    shadowColor: '#234567',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  searchBar: {
    flex: 1,
    fontSize: 18,
    color: '#234567',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 6,
  },
  listContent: {
    paddingHorizontal: SEARCH_BAR_MARGIN,
    paddingBottom: 100,
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    margin: CARD_MARGIN,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    elevation: 5,
    shadowColor: '#234567',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.13,
    shadowRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    height: 135,
    backgroundColor: '#e6eaf3',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
    borderBottomLeftRadius: 0, // changed from 20 to 0
    borderBottomRightRadius: 0, // changed from 20 to 0
  },
  overlay: {
    backgroundColor: '#f7f9fc',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    height: 100, // enough for 2 lines of title + date + location
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#234567',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 4,
    letterSpacing: 0.2,
    textAlignVertical: 'center',
    lineHeight: 22,
    height: 44, // always reserve space for 2 lines
  },
  cardDate: {
    color: '#5a7bb6',
    fontSize: 15,
    marginBottom: 2,
    fontWeight: '500',
    lineHeight: 18,
  },
  cardLocation: {
    color: '#234567',
    fontSize: 15,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },
  favoriteIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
    padding: 4,
    elevation: 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 28,
    bottom: 28,
    backgroundColor: '#5a7bb6',
    borderRadius: 32,
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#234567',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
});