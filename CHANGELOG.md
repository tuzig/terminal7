# ChangeLog

All notable changes to Terminal Seven - the touchable terminal multiplexer 
will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.20.5] - 2022/5/15

### Fixed 

- Reset button now works without a modal dialog
- Modal dialogs border is back

## [0.20.4] - 2022/5/3

### Added

- Installation instruction in the edit and add host modals

### Fixed

- Don't assume SSH sessions are losing state

## [0.20.3] - 2022/5/3

### Fixed

- Fixing the disconnect/reconnect flow
- Placing modals in front of the log
- Connection watchdog streamlined

### Added 

- support for webexec 0.17.0 

## [0.20.2] - 2022/5/1

### Fixed

- Added shell commands to install server and add fingerprint on related problmes
- Default configuration to use "*" for `shell` so you get the default shell 
- "Gate ins not open..." notification fixed


## [0.20.1] - 2022/4/12

## Fixed

- Gate reconnect was flaky
- Window rename now changes just the active window

## [0.20.0] - 2022/4/10

### Changed

- Rendering is super fast thanks to WebGL hardware acceleration
- Using vite & vitest to package and test
- Font is now nerdy patched for special icons

### Fixed 

- Network connections remain open on !mobile 
- Spaces are trimmed from the end of lines copied to clipboard
- Turn servers fetch now has a watchdog

## [0.19.3] - 2022/2/6

### Fixed 

- iPad app now working properly
- Improved webexec installation instructions

## [0.19.2] - 2022/1/2

### Fixed 

- Focusing on active pane after return from the background
- Panes size freezes even though the layout changes

## [0.19.1] - 2021/12/14

### Fixed

- Selecting a test now copies it instead on entering copy mode

## [0.19.0] - 2021/12/14

### Fixed

- Fail connection attempts to stop you from trying again
- PeerBook synchronization - showing unverified peer and helping you verify

### Added

- turn servers by subspace

### Changed

- Home page look & feel
- The yellow is warmer (copied from elflord)

## [0.18.2] - 2021/12/08

### Fixed

- Can copy install one-line on the iPad
- Peerbook invitation text

## [0.18.1] - 2021/12/07

### Changed 

- Updated webexec installation instructions

## [0.18.0] - 2021/11/30

### Added

- tab names bar scrolls on the user's touch
- iPadOS 15 support

### Changed

- Terminal7 is installed as a progressive web app
- default maximum tabs changed to 10
- keyboard help display looks upgrade to look like iPadOS 15.0
- Network activity is indicated in the tabbar

### Fixed

- CTRL-c is working again
- help modals go away when releasing meta

##  [0.17.2] - 2021/10/13

### Fixed

- touch gestures outside the terminal are also recognized
- search box look
- updated version number


## [0.17.1] - 2021/10/13

### Fixed

- touch gestures. funny thing, we lost them on 0.17.0

## [0.17.0] - 2021/10/8

### Added

- copy mode for copying text from the buffer. use Cmd-[ to enter.

## [0.16.3] - 2021/10/1

### Fixed

- fingerprint is now properly displayed
- static IP connections
- clearing memory when closing pane

### Changed

- tab name is edited in a modal

## [0.16.2] - 2021/9/3

### Fixed

- help screen doesn't get cropped
- exit when on zoomed work

## [0.16.1] - 2021/8/15

### Fixed 

- exiting from zoom

## [0.16.0] - 2021/8/11

### Added

- dump debug log to clipboard using META-\`
- watchdog when connection through peerbook

### Fixed 

- starting up with no gates
- hiding disconnect model on connect
- properly handle missing shell
- properly restoring a zoomed session
- when control messages sending fails 3 times, show disconnect modal

## [0.15.6] - 2021/5/21

### Added

- secondary nav bar in home with + and reset

### Fixed

- connecting to peerbook only when needed

## [0.15.5] - 2021/5/19

### Fixed

- improved handling of reseted servers
- latest peerbook protocol 
- improved messages

## [0.15.4] - 2021/5/4

### Added

- invitation to chat in welcome modal
- letting the user reset the certificate when associated with another user

### Fixed

- using the apps userDefaults storage instead of the browser's localStorage
- hiding model when clicking 'X'
- ssri, an indirect dependecy, was bumped to improved security

## [0.15.3] - 2021/4/26

### Fixed

- notifying unverified peers on their verification
- using a new local storage key to display the welcome messgae
- reconnect to peerbook after getting back to the foreground

## [0.15.2] - 2021/4/26

### Fixed 

- welcome dialog

## [0.15.1] - 2021/4/26

### Fixed 

- welcome dialog should show now
- crashing when dotfile had errors
- settings change not reconnecting to peerbook

## [0.15.0] - 2021/4/20

### Added 

- supporting peerbook, a signaling server and adderss book

## [0.14.2] - 2021/3/10

### Fixed

- multiple reconnection bugs should be very stable now
- setting editor
- search bar size & color
- dotfiles editor colors
- cut and border pan work with only single finger
- two finger scroll doesn't change the font size

## [0.14.1] - 2021/2/23

### Added

- first usage welcome message
- help is shown after first succesfull connection

### Changed 

- log messages moved to the side
- same help shown in home and inside a gate

### Fixed

- community link is working properly
- gate doesn't close when there are open windows

## [0.14.0] - 2021/1/21

### Changed 

- generating a webrtc certificate on first run and using it's fingerprint to
  authenticate


## [0.13.1] - 2021/1/17

### Fixed 

- pane not closing on shell exit
- panes not resizing properly when changing to portrait and back

## [0.13.0] - 2021/1/14

### Added

- Reset menu
- Adding api version to auth message

### Changed

- Using the Fira font family

### Fixed 

- The reset button cleans the gate before connecting
- Improoved notification wording
- Focusing on the right window and pane after restore

## [0.12.2] - 2021/1/3

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
