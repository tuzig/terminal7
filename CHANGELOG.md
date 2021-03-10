# ChangeLog

All notable changes to Terminal Seven - the touchable terminal multiplexer 
will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- multiple reconnection bugs should be very stable now
- setting editor
- search bar size & color
- dotfiles editor colors
- cut and border pan work with only single finger
- two finger scroll doesn't change the font size

## [0.14.1] - 2020/2/23

### Added

- first usage welcome message
- help is shown after first succesfull connection

### Changed 

- log messages moved to the side
- same help shown in home and inside a gate

### Fixed

- community link is working properly
- gate doesn't close when there are open windows

## [0.14.0] - 2020/1/21

### Changed 

- generating a webrtc certificate on first run and using it's fingerprint to
  authenticate


## [0.13.1] - 2020/1/17

### Fixed 

- pane not closing on shell exit
- panes not resizing properly when changing to portrait and back

## [0.13.0] - 2020/1/14

### Added

- Reset menu
- Adding api version to auth message

### Changed

- Using the Fira font family

### Fixed 

- The reset button cleans the gate before connecting
- Improoved notification wording
- Focusing on the right window and pane after restore

## [0.12.2] - 2020/1/3

### Fixed 

- fixing first time connection, just after copying the token

## [0.12.1] - 2020/12/31

### Fixed 

- sending state only when changes are made and preventing retry loops

## [0.12.0] - 2020/12/30

### Added

- reconnect button
- more meta key - T, L, R
- special help screen for home

### Fixed

- help links are now pointing where they should (security.md still MIA)
- home screen gate button are tactile
- meaningless timeout messages after reconnect
- when rotating the iPad the tabs resize to fill the space

## [0.11.1] - 2020/12/21

### Fixed

- failure on gate reconnect (infinte loop)
- daylight time is getting longer

## [0.11] - 2020/12/16

### Added

- local windows, e.g. settings, log, are now with magenta border
- orederly disconnect & restore when app is benched

### Fixed

- Unfocused panes border is now back to dark yellow
- Control message retransmit and notifications
- Home button if green only at home

## [0.10.0] - 2020/12/2

### Added

- dividers that show border can move
- version information and link to the change log
- resending control messages on timeout 
- tactile fedback for lng press
- pane navigation keys

### Fixed

- Mutitasking resizing now works as expected
- replacing cordova with capacitor
- `npm run build` works 
- "remember host" label look
- notifications look
- complex layout resizing

## [0.9.3] - 2020/11/17

### Fixed

- Adding host with an existing name is forbidden
- Wrong message on bad host address
- Unchecking "remember host" is no longer ignored
- ctrl-c is working again

## [0.9.2] - 2020/11/15

### Added

- ⌘ is taking over as the leader. long press it to get the list of keys

### Fixed

- Copy mode had limited but complete functionality
- Like always, reconnect is a bit better should be working fine on single window


## [0.9.1] - 2020/11/08

### Added 

- Multitasking support

### Fixed

- Reconnecting after all panes closed is working

## [0.9.0] - 2020/11/04

### Added

- Edit host modal dialog that even lets you delete and reset
- Gracefully handle a stopped server

## [0.8.0] - 2020/10/28

### Fixed

- Removed "disconnected" modal popin when all is OK
- Reconnect now works!!!

### Added

- Adding indicators for network & host connectivity
- App Settings through a dotfile and the CodeMirror editor
- Token generation, storing and copying to server

## [0.7.1] - 2020/10/04

- Update the change log
- Fix resize
- Fix failed connection display

## [0.7.0] - 2020/10/04

### Added

- Support for webexec new api
- Saving and restoring entire layout
- Search

### Fixed 

- ?reconnect?


## [0.5.1] - 2020/07/29

### Added

- movable pane borders by using pan gesture

### Fixed

- Improved icon look & colors
- Thinner border for a cleaner look
- Evenly distributed icons on the navigation bars


## [0.3.2] - 2020/07/20

### Fixed

- Terminals are never to high and the last line is never clipped
- Tests are now loading index.html for more realistic env

## [0.3.1] - 2020/07/19

### Added

- Scaling pane using pinch gestures or "CTRL-A +" & "CTRL-A -"

### Fixed

- Fixing the buttons' font
- Hitting TAB nol longer moves to the next pane
- Fixing disconnect modal on zoomed pane

## [0.3.0] - 2020/07/08

### Added 

- App icons
- Host disconnected view with reconnect and shutdown buttons
- 2.5D design
- Message log

### Fixed

- Windows now close properly
- Display a message when connection attempt fails
- Home page gravitates to the bottom
- Add host gravitates to the bottom
- Handling of disconnection events
- Handling of unreachable hosts
- Tab key no longer focuses on the next element

## [0.2.0] - 2020/06/30

### Added

- Multi host: Adding support for multiple concurrent host connections
- Home page: Displaying the list of remembered hosts and a + button
- Authentication: An authentication control message is sent first
- Host list store & load: Using web's localSTorage
